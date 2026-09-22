import asyncio
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch, Mock, MagicMock

import numpy as np

import audio_output
import audiomanager
import config
import server
import state


class AudioTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.config_patch = patch.object(config, 'CONFIG_PATH', str(Path(self.folder.name) / 'config.json'))
        self.config_patch.start()
        self.addCleanup(self.config_patch.stop)
        with state.lock:
            state.queue.clear()
            state.last_message = ''
            state.last_error = ''
            state.error_id = state.completed_count = 0
            state.rate = 0
            state.engine_ready = True
        self.client = server.app.test_client()

    def wait_until(self, condition):
        deadline = time.monotonic() + 3
        while not condition():
            if time.monotonic() > deadline:
                self.fail('worker did not finish')
            time.sleep(.01)

    def configure(self):
        config.save({'output_device_id': 'cable-id', 'tts_voice': 'uk-UA-PolinaNeural'})

    def test_migration_retains_voice_and_removes_credentials(self):
        Path(config.CONFIG_PATH).write_text(json.dumps({'discord_token': 'old-secret',
            'target_user_id': '123', 'tts_voice': 'uk-UA-PolinaNeural', 'tts_rate': 15}))
        loaded = config.load()
        self.assertEqual(loaded['tts_voice'], 'uk-UA-PolinaNeural')
        self.assertEqual(loaded['tts_rate'], 15)
        self.assertNotIn('discord_token', json.loads(Path(config.CONFIG_PATH).read_text()))

    def test_exact_endpoint_only_never_default_or_fuzzy(self):
        speaker = Mock(id='other-id', name='CABLE Input')
        with patch.object(audio_output.sc, 'all_speakers', return_value=[speaker]), \
             patch.object(audio_output.sc, 'default_speaker') as default:
            with self.assertRaises(RuntimeError):
                audio_output.resolve_device('missing-id')
            with self.assertRaises(RuntimeError):
                audio_output.resolve_device('CABLE')
            default.assert_not_called()
            speaker.player.assert_not_called()

    def test_short_final_buffer_releases_only_written_frames(self):
        player = Mock(channelmap=[0, 1])
        player._render_available_frames.return_value = 960
        player._render_buffer.return_value = [object()]
        with patch.object(audio_output.wasapi._ffi, 'memmove') as copy:
            audio_output._write_pcm(player, np.ones(37, dtype=np.float32), threading.Event())
        player._render_buffer.assert_called_once_with(37)
        player._render_release.assert_called_once_with(37)
        self.assertEqual(copy.call_args.args[2], 37 * 2 * 4)

    def test_audio_interfaces_released_when_device_stop_fails(self):
        player = MagicMock()
        player.__exit__.side_effect = RuntimeError('Unplugged')
        speaker = Mock(channels=2)
        speaker.player.return_value = player
        with patch.object(audio_output.wasapi._com, 'release') as release:
            with self.assertRaisesRegex(RuntimeError, 'Unplugged'):
                with audio_output._player(speaker):
                    pass
        self.assertEqual([call.args[0] for call in release.call_args_list],
                         [player._ppRenderClient, player._ptr])

    def test_selection_persisted_and_invalid_selection_not_saved(self):
        with patch.object(audio_output, 'validate_device', return_value='CABLE Input'):
            self.assertEqual(self.client.post('/config', json={'outputDeviceId': 'cable-id'}).status_code, 200)
        self.assertEqual(config.load()['output_device_id'], 'cable-id')
        with patch.object(audio_output, 'validate_device', side_effect=RuntimeError('Device unavailable')):
            response = self.client.post('/config', json={'outputDeviceId': 'missing'})
            self.assertEqual(response.status_code, 400)
            self.assertEqual(config.load()['output_device_id'], 'cable-id')
            self.assertEqual(self.client.post('/speak', json={'text': 'test'}).status_code, 400)
            self.assertEqual(self.client.get('/status').json['outputStatus'], 'unavailable')
        self.assertEqual(state.queue, [])

    def test_monitor_selection_is_validated_and_persisted(self):
        self.configure()
        with patch.object(audio_output, 'validate_device', return_value='G435 Headphones'):
            response = self.client.post('/config', json={
                'monitorEnabled': True,
                'monitorDeviceId': 'g435-id',
            })
        self.assertEqual(response.status_code, 200)
        saved = config.load()
        self.assertTrue(saved['monitor_enabled'])
        self.assertEqual(saved['monitor_device_id'], 'g435-id')
        self.assertEqual(saved['monitor_device_name'], 'G435 Headphones')

        with patch.object(audio_output, 'validate_device', side_effect=RuntimeError('Monitor unavailable')):
            response = self.client.post('/config', json={'monitorDeviceId': 'missing-id'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(config.load()['monitor_device_id'], 'g435-id')

    def test_repeat_clear_and_settings_snapshot(self):
        self.configure()
        with patch.object(audio_output, 'validate_device', return_value='CABLE Input'):
            self.assertEqual(self.client.post('/repeat').status_code, 400)
            self.client.post('/rate', json={'rate': 20})
            self.client.post('/speak', json={'text': 'first'})
            self.client.post('/repeat')
            config.save({'output_device_id': 'different-id'})
            self.assertEqual([job['text'] for job in state.queue], ['first', 'first'])
            self.assertEqual(state.queue[0]['device_id'], 'cable-id')
            self.assertEqual(state.queue[0]['rate'], 20)
            self.assertEqual(config.load()['tts_rate'], 20)
            self.client.post('/clear')
            self.assertEqual(state.queue, [])
            self.assertEqual(state.last_message, 'first')

    def test_worker_failure_cleanup_fifo_and_recovery(self):
        self.configure()
        played = []
        async def stream(text, voice, rate):
            self.assertEqual(voice, 'uk-UA-PolinaNeural')
            if text == 'network-error':
                raise RuntimeError('Edge TTS unavailable')
            yield b'chunk'
        def play_stream(fetch_audio, device_id, stop_event, on_started):
            fetch_audio(lambda chunk: None)
            played.append(device_id)
            on_started()
            if len(played) == 1:
                raise RuntimeError('Device disconnected during playback')
        with patch.object(audio_output, 'validate_device', return_value='CABLE Input'), \
             patch.object(audiomanager.tts, 'stream', side_effect=stream), \
             patch.object(audio_output, 'play_stream', side_effect=play_stream):
            audiomanager.start()
            try:
                audiomanager.enqueue('network-error')
                self.wait_until(lambda: state.error_id == 1 and state.playback_status == 'idle')
                self.assertIn('Edge TTS', self.client.get('/status').json['error'])
                audiomanager.enqueue('device-error')
                self.wait_until(lambda: state.error_id == 2 and state.playback_status == 'idle')
                self.assertIn('disconnected', self.client.get('/status').json['error'])
                audiomanager.enqueue('recovered')
                self.wait_until(lambda: state.completed_count == 1)
            finally:
                audiomanager.stop()
        self.assertEqual(played, ['cable-id', 'cable-id'])
        self.assertEqual(state.last_error, '')

    def test_shutdown_cancels_generation(self):
        self.configure()
        entered = threading.Event()
        async def stream(text, voice, rate):
            entered.set()
            await asyncio.sleep(60)
            yield b'unused'
        def play_stream(fetch_audio, device_id, stop_event, on_started):
            fetch_audio(lambda chunk: None)
            on_started()
        with patch.object(audio_output, 'validate_device', return_value='CABLE Input'), \
             patch.object(audiomanager.tts, 'stream', side_effect=stream), \
             patch.object(audio_output, 'play_stream', side_effect=play_stream), \
             patch.object(audiomanager, '_playing') as playing:
            audiomanager.start()
            try:
                audiomanager.enqueue('cancel')
                self.assertTrue(entered.wait(2))
            finally:
                audiomanager.stop()
            playing.assert_not_called()
        self.assertFalse(audiomanager._thread.is_alive())


if __name__ == '__main__':
    unittest.main()
