import { ApiError } from '@/lib/api';

export function errorMessage(error: unknown, fallback = '잠시 후 다시 시도해 주세요.') {
  if (error instanceof ApiError) {
    if (error.status === 0) return '인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
    if (error.status === 408) return '서버 응답이 늦어 요청을 마치지 못했어요. 잠시 후 다시 시도해 주세요.';
    if (error.status === 401) return '로그인이 만료됐어요. 다시 로그인해 주세요.';
    if (error.status === 403) return '이 작업을 수행할 권한이 없어요.';
    if (error.status === 404) return '요청한 정보를 찾을 수 없어요.';
    if (error.status === 429) return '요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.';
    if (error.status >= 500) return '서버에 일시적인 문제가 있어요. 잠시 후 다시 시도해 주세요.';
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function asError(error: unknown) {
  return error instanceof Error ? error : new Error(errorMessage(error));
}
