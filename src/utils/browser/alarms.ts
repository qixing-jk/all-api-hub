import { browserApiLogger as logger } from "~/utils/browser/browserEnvironment"

/**
 * 检查是否支持 alarms API
 */
export function hasAlarmsAPI(): boolean {
  return !!browser.alarms
}

/**
 * 创建定时任务
 * @param name 定时任务名称，用于标识和后续查找。
 * @param alarmInfo 定时任务配置对象。
 * @param alarmInfo.periodInMinutes 任务执行的时间间隔（分钟）。
 * @param alarmInfo.delayInMinutes 任务首次执行前的延迟时间（分钟）。
 * @param alarmInfo.when 指定首次触发时间的时间戳（毫秒）。
 */
export async function createAlarm(
  name: string,
  alarmInfo: {
    periodInMinutes?: number
    delayInMinutes?: number
    when?: number
  },
): Promise<void> {
  if (!hasAlarmsAPI()) {
    logger.warn("Alarms API not supported")
    return
  }
  return browser.alarms.create(name, alarmInfo)
}

/**
 * 清除定时任务
 * @param name 要清除的定时任务名称。
 */
export async function clearAlarm(name: string): Promise<boolean> {
  if (!hasAlarmsAPI()) {
    logger.warn("Alarms API not supported")
    return false
  }
  return (await browser.alarms.clear(name)) || false
}

/**
 * 获取定时任务
 * @param name 需要获取的定时任务名称。
 */
export async function getAlarm(
  name: string,
): Promise<browser.alarms.Alarm | undefined> {
  if (!hasAlarmsAPI()) {
    logger.warn("Alarms API not supported")
    return undefined
  }
  return await browser.alarms.get(name)
}

/**
 * 监听定时任务触发事件
 * 返回清理函数
 * @param callback 定时任务触发时调用的处理函数。
 */
export function onAlarm(
  callback: (alarm: browser.alarms.Alarm) => void | Promise<void>,
): () => void {
  if (!hasAlarmsAPI()) {
    logger.warn("Alarms API not supported")
    return () => {}
  }
  browser.alarms.onAlarm.addListener(callback)
  return () => {
    browser.alarms.onAlarm.removeListener(callback)
  }
}
