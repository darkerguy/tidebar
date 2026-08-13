function roundTo(n, decimals) {
  return Math.round(n * 10 ** decimals) / 10 ** decimals;
}

window.meteo = {}

window.meteo.getData = (beach) => {
  const weatherApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${beach.lat}&longitude=${beach.lng}&timezone=auto&forecast_hours=48&hourly=temperature_2m,cloud_cover,wind_speed_10m,wind_direction_10m,weathercode,precipitation,surface_pressure,relative_humidity_2m,precipitation_probability,uv_index&current=temperature_2m,cloud_cover,wind_speed_10m,wind_direction_10m,weathercode,precipitation,surface_pressure,relative_humidity_2m,precipitation_probability,uv_index&daily=uv_index_max,temperature_2m_max,temperature_2m_min,precipitation_probability_max`;
  const seaApiUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${beach.lat}&longitude=${beach.lng}&timezone=auto&forecast_hours=48&hourly=wave_height,sea_level_height_msl,sea_surface_temperature,wave_period&current=wave_height,sea_level_height_msl,sea_surface_temperature,wave_period&daily=wave_height_max`;

  console.log(weatherApiUrl);
  console.log(seaApiUrl);

  const wdata = window.betterFetch(weatherApiUrl).json()
  const sdata = window.betterFetch(seaApiUrl).json()
  
  return { wdata, sdata }
}

window.meteo.genScore = (temp, waterTemp, cloudCover, windSpeed, weatherCode, waveHeight, period, uv, humid) => {
  let score = 10;

  const airTdiff = Math.max(Math.abs(temp - window.settings.tempPref) - window.settings.tempTolerance, 0);
  const tempPunish = roundTo(airTdiff < (temp > window.settings.tempPref ? 4.5 : 3) ? airTdiff * 0.5 : airTdiff * 0.7, 1)
  const seaTdiff = Math.max(Math.abs(waterTemp - window.settings.seaTemp) - window.settings.seaTempTolerance, 0);
  const seaTpunish = roundTo(seaTdiff < 2 ? seaTdiff : seaTdiff * 1.4, 1)

  score = roundTo(score - tempPunish - seaTpunish, 1);

  let cloudPunish;
  if (window.settings.okayClouds === "false") {
    cloudPunish = Math.max(cloudCover - 40, 0) * 0.04;
    score = roundTo(score - cloudPunish, 1);
  } else {
    cloudPunish = 0;
  }

  let windPunish = 0;
  
  const minWind = Number(window.settings.minWind);
  const maxWind = Number(window.settings.maxWind);
  
  // Too calm
  if (windSpeed < minWind) {
    const diff = roundTo(minWind - windSpeed, 1);
    windPunish = diff <= 3 ? diff * 0.3 : diff * 0.6;
  }
  
  // Too windy
  else if (windSpeed > maxWind) {
    const diff = roundTo(windSpeed - maxWind, 1);
    windPunish = diff <= 5 ? diff * 0.3 : diff * 0.7;
  }
  
  windPunish = roundTo(windPunish, 1);
  score = roundTo(score - windPunish, 1);

  const weatherCodePenalties = {
    0: 0, // 0-3 clear-cloudy
    1: 0,
    2: 0,
    3: 0,
    45: window.settings.okayFog === "true" ? 0 : 0.8, // fog
    48: 2, // freezing fog
    51: window.settings.okayRain === "true" ? 0 : 0.5, // drizzle
    53: window.settings.okayRain === "true" ? 0.4 : 0.7,
    55: 1,
    56: 1.8, // freezing drizzle
    57: 2,
    61: window.settings.okayRain === "true" ? 0 : 0.8, // rain
    63: window.settings.okayRain === "true" ? 0.7 : 1.3,
    65: 1.6,
    66: 2, // freezing rain
    67: 2.2,
    71: 1.7, // snow
    73: 2,
    75: 2.4,
    77: 1.4, // snow grains
    80: window.settings.okayRain === "true" ? 0 : 0.3, // showers
    81: window.settings.okayRain === "true" ? 0.4 : 1,
    82: 1.6,
    85: 1,
    86: 1.7,
    95: 4, // storm
    96: 5, // storm + hail
    99: 7, // storm + big hail
  }

  const codePunish = weatherCodePenalties[Number(weatherCode)] ?? 0;

  score = roundTo(score - codePunish, 1);

  let userWavePreferences = [];
  JSON.parse(window.settings.wavePrefs.replace(/'/g, '"')).forEach(pref => { userWavePreferences.push(Number(pref)) })
  if (userWavePreferences.length === 0) {
    userWavePreferences = [0.0, 0.1, 0.2, 0.4]
  }
  const minWaves = Math.min(...userWavePreferences);
  const maxWaves = Math.max(...userWavePreferences);
  let wavePunish;
  if (waveHeight < minWaves) {
    const waveDiff = roundTo(minWaves - waveHeight, 1);
    wavePunish = roundTo(waveDiff <= 0.2 ? waveDiff * 1.8 : waveDiff * 2.5, 1)
  } else if (waveHeight > maxWaves) {
    const waveDiff = roundTo(waveHeight - maxWaves, 1);
    wavePunish = roundTo(waveDiff <= 0.4 ? waveDiff * 3 : waveDiff * 5, 1)
  } else {
    wavePunish = 0;
  }

  score = roundTo(score - wavePunish, 1);

  let periodPunish = 0;
  if (waveHeight <= 0.3) {
    periodPunish = 0;
  } else if (waveHeight <= 0.6) {
    if (period <= 5) {
      periodPunish = (5 - period) * 0.3;
    } else if (period >= 13) {
      periodPunish = (period - 13) * 0.2;
    }
  } else if (waveHeight <= 1.1) {
    if (period <= 6) {
      periodPunish = (6 - period) * 0.6;
    } else if (period >= 11) {
      periodPunish = (period - 11) * ((period - 11) < 3 ? 0.5 : 0.8);
    }
  } else {
    if (period <= 7) {
      periodPunish = (7 - period) * 0.9;
    } else if (period >= 11) {
      periodPunish = (period - 11) * ((period - 11) < 4 ? 0.8 : 1.3);
    }
  }

  periodPunish = roundTo(periodPunish, 1);
  score = roundTo(score - periodPunish, 1);

  let uvPunish;
  if (window.settings.skinSens === "normal" && uv >= 8) {
    const uvDiff = roundTo(uv - 8, 1);
    uvPunish = uvDiff <= 2 ? uvDiff * 1.2 : uvDiff * 2.5;
  } else if (window.settings.skinSens === "high" && uv >= 6) {
    const uvDiff = roundTo(uv - 6, 1);
    uvPunish = uvDiff <= 3 ? uvDiff * 1.5 : uvDiff * 3;
  } else {
    uvPunish = 0;
  }

  score = roundTo(score - uvPunish, 1);

  let humidPunish;
  if (humid < 30) {
    const humidDiff = roundTo(30 - humid, 1);
    humidPunish = roundTo(humidDiff < 15 ? humidDiff * 0.3 : humidDiff, 1);
  } else if (humid > 75) {
    const humidDiff = roundTo(humid - 75, 1);
    humidPunish = roundTo(humidDiff < 10 ? humidDiff * 0.2 : humidDiff * 1.1, 1);
  } else {
    humidPunish = 0;
  }
  humidPunish = Math.min(humidPunish, 6)

  score = roundTo(score - humidPunish, 1);

  score = Math.max(score, 0)

  console.log(JSON.stringify({ score, tempPunish, seaTpunish, cloudPunish, windPunish, codePunish, wavePunish, uvPunish, humidPunish }));
  return { score, tempPunish, seaTpunish, cloudPunish, windPunish, codePunish, wavePunish, periodPunish, uvPunish, humidPunish };
}

window.meteo.genWarnings = (weather, marine) => {
  const times = weather.hourly.time; // ISO timestamps
  const codes = weather.hourly.weathercode;
  const wind = weather.hourly.wind_speed_10m;
  const waves = marine.hourly.wave_height;
  const uv = weather.hourly.uv_index;

  const warnings = [];

  // Merge consecutive indexes into ranges
  const mergeRanges = (indexes) => {
    if (indexes.length === 0) return [];

    const ranges = [];
    let start = indexes[0];
    let prev = indexes[0];

    indexes.forEach((idx, i) => {
      if (i === 0) return;

      if (idx === prev + 1) {
        prev = idx;
      } else {
        ranges.push([start, prev]);
        start = idx;
        prev = idx;
      }
    });

    ranges.push([start, prev]);
    return ranges;
  };

  // Convert index range → datetime range (+1 hour at end)
  const toTimeRange = ([startIdx, endIdx]) => {
    const from = times[startIdx];
    const endMoment = dayjs.tz(times[endIdx], weather.timezone).add(1, "hour");
    const to = endMoment.format("YYYY-MM-DD[T]HH:mm");
    return [from, to];
  };

  // Build warning objects for a given type
  const buildWarning = (type, indexes, elevatedIndexes) => {
    const ranges = mergeRanges(indexes);
    const elevatedRanges = mergeRanges(elevatedIndexes);

    return ranges.map(range => {
      const [from, to] = toTimeRange(range);

      const elevated = elevatedRanges
        .filter(er => er[0] >= range[0] && er[1] <= range[1])
        .map(er => toTimeRange(er));

      return { type, from, to, elevated };
    });
  };

  // === Storms ===
  const stormIdx = [];
  const stormElevatedIdx = [];

  codes.forEach((code, i) => {
    if (code >= 95) stormIdx.push(i);
    if (code >= 96) stormElevatedIdx.push(i);
  });

  buildWarning("storm", stormIdx, stormElevatedIdx).forEach(w => warnings.push(w));

  // === Wind ===
  const windIdx = [];
  const windElevatedIdx = [];

  wind.forEach((ws, i) => {
    if (ws >= 35) windIdx.push(i);
    if (ws >= 50) windElevatedIdx.push(i);
  });

  buildWarning("wind", windIdx, windElevatedIdx).forEach(w => warnings.push(w));

  // === Waves ===
  const waveIdx = [];
  const waveElevatedIdx = [];

  waves.forEach((wh, i) => {
    if (wh >= 1.4) waveIdx.push(i);
    if (wh >= 2.0) waveElevatedIdx.push(i);
  });

  buildWarning("waves", waveIdx, waveElevatedIdx).forEach(w => warnings.push(w));

  // === UV ===
  const uvIdx = [];
  const uvElevatedIdx = [];

  uv.forEach((u, i) => {
    if (u >= 7) uvIdx.push(i);
    if (u >= 9) uvElevatedIdx.push(i);
  });

  buildWarning("uv", uvIdx, uvElevatedIdx).forEach(w => warnings.push(w));

  // === Heat ===
  const heatIdx = [];
  const heatElevatedIdx = [];

  weather.hourly.temperature_2m.forEach((t, i) => {
    if (t >= 34) heatIdx.push(i);
    if (t >= 38) heatElevatedIdx.push(i);
  });

  buildWarning("heat", heatIdx, heatElevatedIdx).forEach(w => warnings.push(w));

  // === Cold ===
  const coldIdx = [];
  const coldElevatedIdx = [];

  weather.hourly.temperature_2m.forEach((t, i) => {
    if (t <= 10) coldIdx.push(i);
    if (t <= 5) coldElevatedIdx.push(i);
  });

  buildWarning("cold", coldIdx, coldElevatedIdx).forEach(w => warnings.push(w));

  // === Water Hot ===
  const waterHotIdx = [];
  const waterHotElevatedIdx = [];

  marine.hourly.sea_surface_temperature.forEach((wt, i) => {
    if (wt >= 30) waterHotIdx.push(i);
    if (wt >= 33) waterHotElevatedIdx.push(i);
  });

  buildWarning("waterHot", waterHotIdx, waterHotElevatedIdx).forEach(w => warnings.push(w));

  // === Water Cold ===
  const waterColdIdx = [];
  const waterColdElevatedIdx = [];

  marine.hourly.sea_surface_temperature.forEach((wt, i) => {
    if (wt <= 18) waterColdIdx.push(i);
    if (wt <= 15) waterColdElevatedIdx.push(i);
  });

  buildWarning("waterCold", waterColdIdx, waterColdElevatedIdx).forEach(w => warnings.push(w));

  // === Wave Period ===
  const period = marine.hourly.wave_period;
  const choppyIdx = [];
  const choppyElevatedIdx = [];
  const swellIdx = [];
  const swellElevatedIdx = [];

  period.forEach((p, i) => {
    if (waves[i] > 0.85) {
      if (p <= 4) choppyIdx.push(i);
      if (p <= 2.5) choppyElevatedIdx.push(i);

      if (p >= 13) swellIdx.push(i);
      if (p >= 15) swellElevatedIdx.push(i);
    }
  });

  buildWarning("choppy", choppyIdx, choppyElevatedIdx).forEach(w => warnings.push(w));
  buildWarning("swell", swellIdx, swellElevatedIdx).forEach(w => warnings.push(w));

  return warnings;
}

window.meteo.generateDaily = (weather, marine, scoresHourly, warnings, beach) => {
  const timezone = weather.timezone;
  const lat = beach.lat;
  const lng = beach.lng;

  // === CONFIG ===
  const bestRangesConfig = {
    minScore: 7,
    minHour: 6,
    maxHour: 21,
    lunchNormal: [12, 14],
    lunchHigh: [11, 15],
    maxRanges: 3,
    minRangeLen: 2,
    maxRangeLen: 4,
  };

  const seaTempConfig = {
    hour: 9,
  };

  // OpenMeteo timestamps are already in correct timezone
  const localDay = (offset) =>
    dayjs().tz(timezone).add(offset, "day").startOf("day");

  const filterDayHours = (dayMoment) => {
    return scoresHourly.filter(h => {
      const m = dayjs.tz(h.time, timezone); // FIXED
      return m.isSame(dayMoment, "day");
    });
  };

  const getSeaTemp = (dayMoment, isToday) => {
    const nowLocal = dayjs().tz(timezone);
    if (isToday && nowLocal.hour() >= 9) {
      return marine.current.sea_surface_temperature;
    }

    const targetHour = seaTempConfig.hour;

    const match = scoresHourly.find(h => {
      const m = dayjs.tz(h.time, timezone); // FIXED
      return m.isSame(dayMoment, "day") && m.hour() === targetHour;
    });

    if (!match) return null;

    const idx = weather.hourly.time.indexOf(match.time);
    return marine.hourly.sea_surface_temperature[idx];
  };

  const filterWarningsForDay = (dayMoment) => {
    const start = dayMoment;
    const end = dayMoment.endOf("day");
    const result = [];

    warnings.forEach(w => {
      const from = dayjs.tz(w.from, timezone); // FIXED
      const to = dayjs.tz(w.to, timezone);     // FIXED

      const overlapStart = from.isBefore(start) ? start : from;
      const overlapEnd = to.isAfter(end) ? end : to;

      const hours = overlapEnd.diff(overlapStart, "hour");
      if (hours >= 2) result.push(w);
    });

    return result;
  };

  const findBestRanges = (dayHours) => {
    const skinSens = window.settings.skinSens;
    const lunch = skinSens === "high"
      ? bestRangesConfig.lunchHigh
      : bestRangesConfig.lunchNormal;

    const filtered = dayHours.filter(h => {
      const m = dayjs.tz(h.time, timezone); // FIXED
      const hour = m.hour();
      if (hour < bestRangesConfig.minHour || hour >= bestRangesConfig.maxHour) return false;
      if (hour >= lunch[0] && hour < lunch[1]) return false;
      return h.score >= bestRangesConfig.minScore;
    });

    if (filtered.length === 0) return [];

    const ranges = [];
    let current = [filtered[0]];

    for (let i = 1; i < filtered.length; i++) {
      const prev = dayjs.tz(filtered[i - 1].time, timezone); // FIXED
      const cur = dayjs.tz(filtered[i].time, timezone);       // FIXED
      if (cur.diff(prev, "hour") === 1) {
        current.push(filtered[i]);
      } else {
        ranges.push(current);
        current = [filtered[i]];
      }
    }
    ranges.push(current);

    const valid = ranges
      .map(r => {
        const len = r.length;
        if (len < bestRangesConfig.minRangeLen || len > bestRangesConfig.maxRangeLen) return null;

        const from = r[0].time;
        const lastMoment = dayjs.tz(r[r.length - 1].time, timezone); // FIXED
        const to = lastMoment.add(1, "hour").format("YYYY-MM-DD[T]HH:mm:ss").slice(0, 16);

        const peak = r.reduce((best, h) => h.score > best.score ? h : best, r[0]);
        const lowestScore = r.reduce((min, h) => h.score < min ? h.score : min, r[0].score);

        return {
          from,
          to,
          peakTime: peak.time,
          peakScore: peak.score,
          lowestScore
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.peakScore - a.peakScore)
      .slice(0, bestRangesConfig.maxRanges);

    return valid;
  };

  const findBestHour = (dayHours, dayOnly) => {
    if (dayHours.length === 0) return null;

    const skinSens = window.settings.skinSens;
    const lunch = skinSens === "high"
      ? bestRangesConfig.lunchHigh
      : bestRangesConfig.lunchNormal;

    const candidates = dayHours.filter(h => {
      const m = dayjs.tz(h.time, timezone); // FIXED
      const hour = m.hour();
      if (dayOnly && (hour < 7 || hour >= 19)) return false;
      return true;
    });

    if (candidates.length === 0) return null;

    const scorePref = (h) => {
      const m = dayjs.tz(h.time, timezone); // FIXED
      const hour = m.hour();
      let bonus = 0;

      if (hour < 7) bonus -= 1.0;
      if (hour > 20) bonus -= 1.0;
      if (hour >= lunch[0] && hour < lunch[1]) bonus -= 1.5;

      return h.score + bonus;
    };

    let best = candidates[0];
    candidates.forEach(h => {
      if (scorePref(h) > scorePref(best)) best = h;
    });

    return best;
  };

  const makeDay = (dayIndex, dayMoment, isToday) => {
    const date = isToday
      ? dayjs().tz(timezone).format("YYYY-MM-DD[T]HH:mm:ss")
      : dayMoment.format("YYYY-MM-DD[T]HH:mm:ss");

    const dateShort = dayMoment.format("YYYY-MM-DD");

    const dayHours = filterDayHours(dayMoment);

    const bestRanges = findBestRanges(dayHours);
    const bestHour = findBestHour(dayHours, false);
    const bestHourDay = findBestHour(dayHours, true);

    console.log(dayMoment.format("YYYY-MM-DD[T]HH:mm:ss"));
    console.log(dayMoment.utc().format("YYYY-MM-DD[T]HH:mm:ss"));

    const sun = SunCalc.getTimes(new Date(dayMoment.year(), dayMoment.month(), dayMoment.date(), 11, 30, 0), lat, lng);

    const sunrise = dayjs.utc(sun.sunrise).tz(timezone).format("YYYY-MM-DD[T]HH:mm:ss");
    const sunset = dayjs.utc(sun.sunset).tz(timezone).format("YYYY-MM-DD[T]HH:mm:ss");
    const goldenHour = dayjs.utc(sun.goldenHour).tz(timezone).format("YYYY-MM-DD[T]HH:mm:ss");

    const maxTemp = weather.daily.temperature_2m_max[dayIndex];
    const minTemp = weather.daily.temperature_2m_min[dayIndex];
    const uv = weather.daily.uv_index_max[dayIndex];
    const precipitationProb = weather.daily.precipitation_probability_max[dayIndex];
    const maxWaves = marine.daily.wave_height_max[dayIndex];

    const seaTemp = getSeaTemp(dayMoment, isToday);

    const dayWarnings = filterWarningsForDay(dayMoment);

    return {
      date,
      dateShort,
      bestRanges,
      bestHour,
      bestHourDay,
      sunrise,
      sunset,
      goldenHour,
      maxTemp,
      minTemp,
      uv,
      precipitationProb,
      maxWaves,
      seaTemp,
      warnings: dayWarnings
    };
  };

  const todayMoment = localDay(0);
  const tomorrowMoment = localDay(1);

  return {
    today: makeDay(0, todayMoment, true),
    tomorrow: makeDay(1, tomorrowMoment, false),
  };
};

window.meteo.generateContext = (weather, marine, scoreNow, scoresHourly, daily, beach) => {
  const now = window.$$$HackTime$$$ ? dayjs.tz($$$HackTime$$$, weather.timezone) : dayjs().tz(weather.timezone);
  const hour = now.hour();
  const times = {
    sunrise: dayjs.tz(daily.today.sunrise, weather.timezone),
    sunset: dayjs.tz(daily.today.sunset, weather.timezone),
    goldenHour: dayjs.tz(daily.today.goldenHour, weather.timezone),
  };
  let timeOfDay = "lateNight";
  if (hour < 4) { // 0:00 - 3:59
    timeOfDay = "lateNight";
  } else if (now.isBefore(times.sunrise)) { // 4:00 - sunrise
    timeOfDay = "dawn";
  } else if (hour < 9) { // sunrise - 8:59
    timeOfDay = "earlyMorning";
  } else if (hour < 11) { // 9:00 - 10:59
    timeOfDay = "morning";
  } else if (hour < 15) { // 11:00 - 14:59
    timeOfDay = "midday";
  } else if (now.isBefore(times.goldenHour.subtract(20, "minute"))) { // 15:00 - 20 minutes before golden hour
    timeOfDay = "afternoon";
  } else if (now.isBefore(times.sunset)) { // 20 minutes before golden hour - sunset
    timeOfDay = "evening";
  } else { // sunset - 23:59
    timeOfDay = "night";
  }
  console.log(times);
  console.log({sunrise: daily.today.sunrise, goldenHour: daily.today.goldenHour, sunset: daily.today.sunset});

  const ctx = { timeOfDay, beach }

  const result = { ctx }

  result.uiClass = timeOfDay;
  if (weather.current.cloud_cover > 85 || weather.current.weathercode >= 60) {
    result.uiClass = "cloud";
  }
  if ((timeOfDay === "dawn" || timeOfDay === "earlyMorning") && weather.current.weathercode >= 45 && weather.current.weathercode < 50) {
    result.uiClass = "foggy";
  }
  if (scoreNow < 3) {
    result.uiClass = "bad";
  }

  if (timeOfDay === "dawn") {
    result.sunrise = times.sunrise;
    result.sunriseRawDateTime = daily.today.sunrise;
    result.sunriseViewable = weather.current.cloud_cover <= 50 && beach.orientation !== "west";
  }
  if (["dawn", "earlyMorning", "morning"].includes(timeOfDay)) {
    result.todayMaxTemp = daily.today.maxTemp;
    result.bestTimes = daily.today.bestRanges;
    result.maxWave = daily.today.maxWaves;
    result.uvMax = daily.today.uv;
  }
  if (timeOfDay === "midday") {
    result.nowUv = weather.current.uv_index;
    const uvRanges = {
      needSunscreen: 3,
      needStrongSunscreen: 6,
      shade: 9,
      stayInside: 11,
    }
    if (settings.skinSens === "high") {
      uvRanges.needSunscreen = 2;
      uvRanges.needStrongSunscreen = 5;
      uvRanges.shade = 7;
      uvRanges.stayInside = 9;
    }
    result.recommendation = result.nowUv >= uvRanges.stayInside ? "stayInside" :
                            result.nowUv >= uvRanges.shade ? "shade" :
                            result.nowUv >= uvRanges.needStrongSunscreen ? "needStrongSunscreen" :
                            result.nowUv >= uvRanges.needSunscreen ? "needSunscreen" :
                            "ok";
  }
  if (timeOfDay === "evening") {
    result.sunset = times.sunset;
    result.sunsetRawDateTime = daily.today.sunset;
    result.sunsetViewable = weather.current.cloud_cover <= 50 && beach.orientation !== "east";
    result.goldenHour = times.goldenHour;
    result.goldenHourRawDateTime = daily.today.goldenHour;
  }
  if (["evening", "night"].includes(timeOfDay)) {
    let i = 0;
    let targeti = weather.hourly.time.indexOf(now.add(1, "day").format("YYYY-MM-DD[T09:00]"));
    console.log(targeti);
    let rainType = 0;
    while (i <= targeti) {
      const code = weather.hourly.weathercode[i];
      if (code >= 50 && code > rainType) {
        rainType = code;
      }
      console.log("Running, rep " + i + "/" + targeti);
      i++;
    }
    let rainSeverity = "none";
    if ((rainType > 3 && rainType < 60) || (rainType > 80 && rainType < 90)) { rainSeverity = "light"; }
    if ([55, 56, 57, 61, 63, 71, 77, 80, 81, 85].includes(rainType)) { rainSeverity = "moderate"; }
    if ([65, 66, 67, 73, 75, 82, 86, 95].includes(rainType)) { rainSeverity = "heavy"; }
    if ([96, 99].includes(rainType)) { rainSeverity = "insane"; }

    result.rainTonight = { code: rainType, severity: rainSeverity }
  }

  let i = 1;
  while (i <= 12) {
    const time = weather.hourly.time[i];
    const code = weather.hourly.weathercode[i];
    console.log(time, code);
    if (code > 3) {
      console.log(meteo.codeToLabel(code) + " expected at " + time);
      result.expected = { time, code };
      break;
    } else {
      console.log(meteo.codeToLabel(code));
      result.expected = null;
    }
    i++;
  }

  return result;
}

window.meteo.all = (beach) => {
  const results = window.meteo.getData(beach);
  const weather = results.wdata;
  const marine = results.sdata;
  console.log({ weather, marine });
  const warnings = window.meteo.genWarnings(weather, marine);
  const scoreNow = window.meteo.genScore(weather.current.temperature_2m, marine.current.sea_surface_temperature, weather.current.cloud_cover, weather.current.windspeed_10m, weather.current.weathercode, marine.current.wave_height, marine.current.wave_period, weather.current.uv_index, weather.current.relativehumidity_2m);
  const scoresHourly = [];

  weather.hourly.time.forEach((t, i) => {
    scoresHourly.push({
      time: t,
      ...window.meteo.genScore(
        weather.hourly.temperature_2m[i],
        marine.hourly.sea_surface_temperature[i],
        weather.hourly.cloud_cover[i],
        weather.hourly.wind_speed_10m[i],
        weather.hourly.weathercode[i],
        marine.hourly.wave_height[i],
        marine.hourly.wave_period[i],
        weather.hourly.uv_index[i],
        weather.hourly.relative_humidity_2m[i]
      )
    });
  });

  const timezone = weather.timezone;

  const ldate = (date) => { return date ? dayjs.tz(date, timezone) : dayjs().tz(timezone) } // local date

  const daily = meteo.generateDaily(weather, marine, scoresHourly, warnings, beach);
  const context = meteo.generateContext(weather, marine, scoreNow, scoresHourly, daily, beach);

  return { weather, marine, warnings, scoreNow, scoresHourly, daily, context, timezone, ldate };
}

window.meteo.codeToLabel = (code, type = "both") => {
  const codeMap = {
    0: ["☀️", "Clear"],
    1: ["🌤️", "Some clouds"],
    2: ["⛅", "Partly cloudy"],
    3: ["☁️", "Cloudy"],
    45: ["🌫️", "Fog"],
    48: ["🧊", "Freezing fog"],
    51: ["🌦️", "Light drizzle"],
    53: ["🌦️", "Mild drizzle"],
    55: ["🌧️", "Heavy drizzle"],
    56: ["💧", "Light freezing drizzle"],
    57: ["💧", "Heavy freezing drizzle"],
    61: ["🌧️", "Light rain"],
    63: ["🌧️", "Mild rain"],
    65: ["🌧️", "Heavy rain"],
    66: ["💧", "Light freezing rain"],
    67: ["💧", "Heavy freezing rain"],
    71: ["🌨️", "Light snow"],
    73: ["🌨️", "Mild snow"],
    75: ["🌨️", "Heavy snow"],
    77: ["❄️", "Snow grains"],
    80: ["🌦️", "Light rain showers"],
    81: ["🌦️", "Mild rain showers"],
    82: ["🌦️", "Violent showers"],
    85: ["🌨️", "Light snow showers"],
    86: ["🌨️", "Heavy snow showers"],
    95: ["⛈️", "Thunderstorm"],
    96: ["⛈️", "Thunderstorm with hail"],
    99: ["⛈️", "Intense thunderstorm with heavy hail"],
  };

  const result = codeMap[code] ? codeMap[code] : ["👽", "Alien invasion"];

  type = type.toLowerCase();
  if (type === "label") type = "text";

  if (type === "icon") { return result[0]; }
  else if (type === "text") { return result[1]; }
  else if (type === "both") { return result[0] + " " + result[1]; }
  else if (type === "array") { return result; }
  else { console.error("Invalid type, pls use icon, text, both or array. Whatever you gave me isn't a real type lol."); }
}

window.meteo.scoreScale = (score) => {
  const range = score === 10 ? "perfect" :
         score >= 9.5 ? "excellent" :
         score >= 9 ? "great" :
         score >= 7.5 ? "good" :
         score >= 6 ? "okay" :
         score >= 3.5 ? "poor" :
         score >= 1 ? "bad" :
         "horrible"

  const textColorMap = {
    "perfect": "#8500f2",
    "excellent": "#0088ff",
    "great": "#23b178",
    "good": "#00b300",
    "okay": "#636327",
    "poor": "#cc7a00",
    "bad": "#ff4500",
    "horrible": "#702626"
  }

  const textEmojiMap = {
    "perfect": "🌀",
    "excellent": "🌊",
    "great": "🍃",
    "good": "🌿",
    "okay": "🌴",
    "poor": "⚡",
    "bad": "🥵",
    "horrible": "⛔"
  }

  return { range, color: textColorMap[range], emoji: textEmojiMap[range] }
}

meteo.angleToDirection = (angle) => {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.floor(((angle % 360) + 22.5) / 45) % 8;
  return directions[index];
}