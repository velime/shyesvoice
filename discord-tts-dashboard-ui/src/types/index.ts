export interface SystemStatus {
  botStatus: 'online' | 'offline';
  botUsername: string;
  voiceStatus: 'connected' | 'disconnected';
  voiceChannelId: string | null;
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

export interface BotConfig {
  configured: boolean;
  discordToken: string;
  targetUserId: string;
  ttsVoice: string;
  ttsRate: number;
  inviteUrl: string | null;
}

export interface VoiceOption {
  name: string;
  locale: string;
  gender: string;
}

export interface VoiceChannelOption {
  id: string;
  name: string;
  guildId: string;
  guildName: string;
}
