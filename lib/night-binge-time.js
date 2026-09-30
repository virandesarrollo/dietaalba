const NIGHT_END = '06:00';

export function isNightBingeTime(nowTime, startTime) {
  return startTime < NIGHT_END
    ? nowTime >= startTime && nowTime < NIGHT_END
    : nowTime >= startTime || nowTime < NIGHT_END;
}
