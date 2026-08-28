import { BotConfig, VoiceChannelOption, VoiceOption } from '../types';

// In dev (`npm run dev`, served on :5173) the API lives on a different
// origin, so it's addressed explicitly and needs a CORS allowance on the
// Flask side. In the production build the dashboard is served BY Flask
// itself, so a relative URL keeps every request same-origin — no CORS
// involved, and it keeps working no matter which hostname/IP was used to
// reach the page (localhost, 127.0.0.1, ...).
const BASE_URL = import.meta.env.DEV ? 'http://localhost:5000' : '';

async function request<T = void>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      let errorText = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        errorText = body.error || errorText;
      } catch {
        // response wasn't JSON — keep the generic HTTP status message
      }
      return { success: false, error: errorText };
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      return { success: true, data };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    return { success: false, error: message };
  }
}

export const ttsApi = {
  speak: (text: string) =>
    request('/speak', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  repeat: () =>
    request('/repeat', {
      method: 'POST',
    }),

  clearQueue: () =>
    request('/clear', {
      method: 'POST',
    }),

  setRate: (rate: number) =>
    request('/rate', {
      method: 'POST',
      body: JSON.stringify({ rate }),
    }),

  getStatus: () =>
    request<{
      botStatus: 'online' | 'offline';
      botUsername: string;
      voiceStatus: 'connected' | 'disconnected';
      voiceChannelId: string | null;
      queueSize: number;
      lastMessage: string;
    }>('/status', {
      method: 'GET',
    }),

  getConfig: () => request<BotConfig>('/config', { method: 'GET' }),

  saveConfig: (patch: Partial<{
    discordToken: string;
    targetUserId: string;
    ttsVoice: string;
    ttsRate: number;
  }>) =>
    request<{ ok: boolean; restarting: boolean }>('/config', {
      method: 'POST',
      body: JSON.stringify(patch),
    }),

  getVoices: () => request<VoiceOption[]>('/voices', { method: 'GET' }),

  getChannels: () => request<VoiceChannelOption[]>('/channels', { method: 'GET' }),

  joinChannel: (channelId: string) =>
    request('/join', {
      method: 'POST',
      body: JSON.stringify({ channelId }),
    }),

  leaveChannel: () =>
    request('/leave', {
      method: 'POST',
    }),
};
