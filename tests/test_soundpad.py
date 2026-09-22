from pathlib import Path
import tempfile
import threading
import unittest
import wave
from unittest.mock import patch

import numpy as np
import playback_output
import soundpad_output as sp


class SoundpadTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.slot = Path(self.folder.name) / 'shyesvoice-live-tts.wav'
        patcher = patch.object(sp, 'SLOT', self.slot)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_soundpad_route_never_falls_back_to_speakers(self):
        with patch.object(sp, 'play', side_effect=RuntimeError('Soundpad offline')), \
             patch.object(playback_output.audio_output, 'play') as speakers:
            with self.assertRaises(RuntimeError):
                playback_output.play('test.mp3', playback_output.SOUNDPAD_ID, threading.Event())
        speakers.assert_not_called()

    def test_local_monitor_and_microphone_play_together(self):
        calls = []
        started = []
        barrier = threading.Barrier(2)
        def microphone(path, stop, on_started):
            calls.append(('microphone', path))
            on_started()
            barrier.wait(timeout=1)
        def monitor(path, device_id, stop, on_started):
            calls.append(('monitor', path, device_id))
            on_started()
            barrier.wait(timeout=1)
        with patch.object(sp, 'play', side_effect=microphone), \
             patch.object(playback_output.audio_output, 'play', side_effect=monitor), \
             patch.object(playback_output, 'validate_monitor', return_value='G435'):
            playback_output.play('tts.mp3', playback_output.SOUNDPAD_ID, threading.Event(),
                                 lambda: started.append(True), True, 'g435-id')
        self.assertCountEqual(calls, [('microphone', 'tts.mp3'), ('monitor', 'tts.mp3', 'g435-id')])
        self.assertEqual(started, [True])

    def test_local_monitor_failure_stops_both_and_is_reported(self):
        monitor_started = threading.Event()
        def microphone(path, stop, on_started):
            monitor_started.wait(1)
            self.assertTrue(stop.wait(1))
        def monitor(path, device_id, stop, on_started):
            monitor_started.set()
            raise RuntimeError('Headphones disconnected')
        with patch.object(sp, 'play', side_effect=microphone), \
             patch.object(playback_output.audio_output, 'play', side_effect=monitor), \
             patch.object(playback_output, 'validate_monitor', return_value='G435'):
            with self.assertRaisesRegex(RuntimeError, 'Local monitor failed: Headphones disconnected'):
                playback_output.play('tts.mp3', playback_output.SOUNDPAD_ID, threading.Event(),
                                     monitor_enabled=True, monitor_device_id='g435-id')

    def test_old_api_double_backslash_paths(self):
        path = str(self.slot).replace('\\', '\\\\')
        with patch.object(sp, 'request', return_value=f'<Soundlist><Sound index="49" url="{path}" /></Soundlist>'):
            self.assertEqual(sp._find_slot(), 49)

    def test_reuses_one_entry_microphone_only_and_erases_speech(self):
        commands = []
        def request(command):
            commands.append(command)
            if command == 'GetPlayStatus()':
                return 'STOPPED'
            if command == 'GetTitleText()':
                return 'Soundpad'
            return 'R-200'
        with patch.object(sp, 'request', side_effect=request), \
             patch.object(sp, '_find_slot', return_value=49), \
             patch.object(sp.audio_output, 'decode_mp3', return_value=np.ones(48000, dtype=np.float32)):
            sp.play('test.mp3', threading.Event())
            sp.play('test2.mp3', threading.Event())
        self.assertEqual(commands.count('DoPlaySound(49,false,true)'), 2)
        self.assertFalse(any(c.startswith('DoAddSound') or c.startswith('DoRemove') for c in commands))
        with wave.open(str(self.slot)) as audio:
            self.assertEqual(audio.getnframes(), 960)
            self.assertFalse(any(audio.readframes(960)))

    def test_soundpad_command_failure_is_reported_and_speech_erased(self):
        def request(command):
            if command.startswith('DoPlaySound'):
                return 'R-500'
            return 'STOPPED' if command == 'GetPlayStatus()' else 'R-200'
        with patch.object(sp, 'request', side_effect=request), \
             patch.object(sp, '_find_slot', return_value=49), \
             patch.object(sp.audio_output, 'decode_mp3', return_value=np.ones(48000)):
            with self.assertRaisesRegex(RuntimeError, 'Soundpad rejected DoPlaySound'):
                sp.play('test.mp3', threading.Event())
        with wave.open(str(self.slot)) as audio:
            self.assertFalse(any(audio.readframes(960)))

    def test_finishes_between_status_and_title_calls(self):
        states = iter(['STOPPED', 'PLAYING', 'STOPPED'])
        def request(command):
            if command == 'GetPlayStatus()':
                return next(states)
            return 'Soundpad' if command == 'GetTitleText()' else 'R-200'
        with patch.object(sp, 'request', side_effect=request), \
             patch.object(sp, '_find_slot', return_value=49), \
             patch.object(sp.audio_output, 'decode_mp3', return_value=np.ones(48000)):
            sp.play('test.mp3', threading.Event())

    def test_cancel_does_not_stop_another_sound(self):
        stop = threading.Event()
        stop.set()
        commands = []
        def request(command):
            commands.append(command)
            return 'PLAYING' if command == 'GetPlayStatus()' else 'R-200'
        with patch.object(sp, 'request', side_effect=request), \
             patch.object(sp.audio_output, 'decode_mp3', return_value=np.ones(48000)):
            sp.play('test.mp3', stop)
        self.assertNotIn('DoStopSound()', commands)
        self.assertFalse(self.slot.exists())


if __name__ == '__main__':
    unittest.main()
