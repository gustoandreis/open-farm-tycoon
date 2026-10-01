import type { I18nParams, SimContext } from './context';
import type { NotificationCategory } from './types';

const MAX_NOTIFICATIONS = 60;

/** NotificationManager (simulation side): stores and emits a localizable notification. */
export function notify(
  ctx: SimContext,
  category: NotificationCategory,
  key: string,
  params?: I18nParams,
): void {
  const s = ctx.state;
  s.notifications.push({
    id: s.nextId++,
    day: s.day,
    category,
    text: params ? `${key}|${JSON.stringify(params)}` : key,
  });
  if (s.notifications.length > MAX_NOTIFICATIONS)
    s.notifications.splice(0, s.notifications.length - MAX_NOTIFICATIONS);
  ctx.emit('notify', { category, key, params });
}
