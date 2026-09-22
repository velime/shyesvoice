export interface SystemStatus {
  engineStatus: 'online' | 'offline';
  outputStatus: 'ready' | 'unavailable';
  outputDeviceId: string;
  outputDeviceName: string;
  playbackStatus: 'idle' | 'generating' | 'playing';
  activeDeviceId: string;
  error: string;
  errorId: number;
  completedCount: number;
  queueSize: number;
  lastMessage: string;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TTSConfig {
  configured: boolean;
  outputDeviceId: string;
  outputDeviceName: string;
  monitorEnabled: boolean;
  monitorDeviceId: string;
  monitorDeviceName: string;
  ttsVoice: string;
  ttsRate: number;
}

export interface VoiceOption {
  name: string;
  locale: string;
  gender: string;
}

export interface OutputDevice {
  id: string;
  name: string;
  kind?: 'soundpad';
  available?: boolean;
}
