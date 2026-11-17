import { apiRequest } from './client';

interface RecoveryMessage {
  success: true;
  message: string;
}

/** Silent by design: the server answers the same whether or not the email exists. */
export function requestPasswordReset(email: string): Promise<RecoveryMessage> {
  return apiRequest<RecoveryMessage>('/auth/forgot-password', {
    method: 'POST',
    body: { email },
    auth: false,
  });
}

export function resetPasswordWithToken(token: string, password: string): Promise<RecoveryMessage> {
  return apiRequest<RecoveryMessage>('/auth/reset-password', {
    method: 'POST',
    body: { token, password },
    auth: false,
  });
}
