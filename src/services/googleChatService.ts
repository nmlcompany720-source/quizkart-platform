import { getCachedAccessToken, signInWithGoogle } from '../firebase';

export interface GoogleChatSpace {
  name: string; // e.g. "spaces/AAAAAAAAAAA"
  displayName?: string;
  type?: 'SPACE' | 'GROUP_CHAT' | 'DIRECT_MESSAGE';
  spaceType?: 'SPACE' | 'GROUP_CHAT' | 'DIRECT_MESSAGE';
  spaceThreadingState?: string;
  externalUserAllowed?: boolean;
  createTime?: string;
}

export interface GoogleChatMessage {
  name: string; // e.g. "spaces/AAA/messages/BBB"
  text?: string;
  sender?: {
    name?: string;
    displayName?: string;
    avatarUrl?: string;
    type?: string;
  };
  createTime?: string;
  reactions?: Array<{
    name: string;
    emoji?: { unicode?: string };
    count?: number;
  }>;
}

class GoogleChatService {
  private async getValidToken(): Promise<string> {
    const token = getCachedAccessToken();
    if (token) return token;

    // Prompt sign-in popup to acquire fresh token with Chat scopes
    const { accessToken } = await signInWithGoogle();
    if (!accessToken) {
      throw new Error('Google Chat authorization is required. Please authenticate.');
    }
    return accessToken;
  }

  /**
   * List all Google Chat spaces accessible by the user
   */
  async listSpaces(): Promise<GoogleChatSpace[]> {
    const token = await this.getValidToken();
    const res = await fetch('https://chat.googleapis.com/v1/spaces', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to fetch spaces (${res.status})`);
    }

    const data = await res.json();
    return data.spaces || [];
  }

  /**
   * Create a new space in Google Chat (e.g. for QuizKart tournaments or player discussion)
   */
  async createSpace(displayName: string): Promise<GoogleChatSpace> {
    const token = await this.getValidToken();
    const res = await fetch('https://chat.googleapis.com/v1/spaces', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        displayName: displayName.trim(),
        spaceType: 'SPACE',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to create space (${res.status})`);
    }

    return await res.json();
  }

  /**
   * List messages in a space
   */
  async listMessages(spaceName: string, pageSize = 30): Promise<GoogleChatMessage[]> {
    const token = await this.getValidToken();
    const res = await fetch(`https://chat.googleapis.com/v1/${spaceName}/messages?pageSize=${pageSize}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to load messages (${res.status})`);
    }

    const data = await res.json();
    // Google Chat returns newest to oldest or vice-versa, sort oldest to newest for chat view
    const messages: GoogleChatMessage[] = data.messages || [];
    return messages.reverse();
  }

  /**
   * Send a message to a space
   * NOTE: The calling UI MUST prompt the user for explicit confirmation before calling this method.
   */
  async sendMessage(spaceName: string, text: string): Promise<GoogleChatMessage> {
    const token = await this.getValidToken();
    const res = await fetch(`https://chat.googleapis.com/v1/${spaceName}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to send message (${res.status})`);
    }

    return await res.json();
  }

  /**
   * Delete a message in Google Chat
   * NOTE: The calling UI MUST prompt the user for explicit confirmation before calling this method.
   */
  async deleteMessage(messageName: string): Promise<void> {
    const token = await this.getValidToken();
    const res = await fetch(`https://chat.googleapis.com/v1/${messageName}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to delete message (${res.status})`);
    }
  }

  /**
   * React to a message in Google Chat
   */
  async reactToMessage(messageName: string, emojiUnicode: string): Promise<void> {
    const token = await this.getValidToken();
    const res = await fetch(`https://chat.googleapis.com/v1/${messageName}/reactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        emoji: { unicode: emojiUnicode },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('Reaction error:', err.error?.message || res.status);
    }
  }
}

export const googleChatService = new GoogleChatService();
