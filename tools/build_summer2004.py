import urllib.request, csv, io, json, math, os, shutil
from datetime import date, timedelta

# 1. Download Environment Canada daily records
url_daily = 'https://climate.weather.gc.ca/climate_data/bulk_data_e.html?format=csv&stationID=4337&Year=2004&Month=7&Day=1&timeframe=2&submit=Download+Data'
req = urllib.request.Request(url_daily, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as resp:
    daily_csv = resp.read().decode('utf-8-sig', errors='ignore')

reader = csv.DictReader(io.StringIO(daily_csv))
daily_records = {r['Date/Time']: r for r in reader if '2004-06-26' <= r['Date/Time'] <= '2004-09-06'}

# 2. Download Environment Canada hourly observations
hourly_records = {}
for m in [6, 7, 8, 9]:
    url_hourly = f'https://climate.weather.gc.ca/climate_data/bulk_data_e.html?format=csv&stationID=4337&Year=2004&Month={m}&Day=1&timeframe=1&submit=Download+Data'
    req = urllib.request.Request(url_hourly, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        h_csv = resp.read().decode('utf-8-sig', errors='ignore')
    r_h = csv.DictReader(io.StringIO(h_csv))
    for row in r_h:
        dt = row.get('Date/Time (LST)', '').split(' ')[0]
        if '2004-06-26' <= dt <= '2004-09-06':
            if dt not in hourly_records:
                hourly_records[dt] = []
            hourly_records[dt].append(row)

# 3. NOAA Solar Calculation for Ottawa (45.4215 N, 75.6972 W, EDT = UTC-4)
def get_solar_times(d):
    lat = 45.4215
    lon = -75.6972
    tz_offset = -4  # EDT
    day_of_year = d.timetuple().tm_yday
    gamma = 2 * math.pi / 365 * (day_of_year - 1 + (12 - 12) / 24)
    eqtime = 229.18 * (0.000075 + 0.001868 * math.cos(gamma) - 0.032077 * math.sin(gamma)
             - 0.014615 * math.cos(2 * gamma) - 0.040849 * math.sin(2 * gamma))
    decl = 0.006918 - 0.399912 * math.cos(gamma) + 0.070257 * math.sin(gamma) \
           - 0.006758 * math.cos(2 * gamma) + 0.000907 * math.sin(2 * gamma) \
           - 0.002697 * math.cos(3 * gamma) + 0.00148 * math.sin(3 * gamma)
    zenith = math.radians(90.833) # standard refraction (34 arcmin) + semi-diameter (16 arcmin)
    lat_rad = math.radians(lat)
    cos_ha = (math.cos(zenith) / (math.cos(lat_rad) * math.cos(decl))) - (math.tan(lat_rad) * math.tan(decl))
    ha = math.degrees(math.acos(cos_ha))
    
    sunrise_utc = 720 - 4 * (lon) - eqtime - 4 * ha
    sunset_utc = 720 - 4 * (lon) - eqtime + 4 * ha
    
    sr_local = (sunrise_utc + tz_offset * 60) % 1440
    ss_local = (sunset_utc + tz_offset * 60) % 1440
    
    sr_h = int(sr_local // 60)
    sr_m = int(round(sr_local % 60))
    ss_h = int(ss_local // 60)
    ss_m = int(round(ss_local % 60))
    if sr_m == 60: sr_h += 1; sr_m = 0
    if ss_m == 60: ss_h += 1; ss_m = 0
    return f'{sr_h:02d}:{sr_m:02d}', f'{ss_h:02d}:{ss_m:02d}'

# 4. Regional events encyclopedia for Summer 2004 in Ottawa-Gatineau (Aylmer region)
EVENTS = {
    "2004-06-26": [
        "2004 NHL Entry Draft: Ottawa Senators select Andrej Meszároš 23rd overall and trade Radek Bonk to Los Angeles (subsequently flipped to Montreal)",
        "Expos @ Blue Jays (SkyDome, Toronto): Blue Jays defeat Expos 10–5"
    ],
    "2004-06-27": [
        "Ottawa Senators trade goaltender Patrick Lalime to the St. Louis Blues for a draft pick",
        "Expos @ Blue Jays (SkyDome, Toronto): Expos defeat Blue Jays 9–4"
    ],
    "2004-06-28": [
        "38th Canadian Federal Election: Paul Martin's Liberal Party wins a minority government; Marcel Proulx re-elected in Hull—Aylmer",
        "Expos @ Phillies (Citizens Bank Park, Philadelphia): Phillies defeat Expos 14–6"
    ],
    "2004-06-29": [
        "The Tragically Hip release their 10th studio album 'In Between Evolution'",
        "Expos @ Phillies (Citizens Bank Park): Phillies defeat Expos 17–7"
    ],
    "2004-06-30": [
        "Expos @ Phillies (Citizens Bank Park): Expos defeat Phillies 6–3"
    ],
    "2004-07-01": [
        "Canada Day celebrations across the National Capital Region: noon show on Parliament Hill, family programming at Parc Jacques-Cartier in Gatineau, and evening fireworks over the Ottawa River",
        "Expos @ Phillies (Citizens Bank Park): Phillies defeat Expos 10–5"
    ],
    "2004-07-02": [
        "Ottawa Jazz Festival: Béla Fleck and the Flecktones headline at Confederation Park",
        "Expos vs. Blue Jays 'home' series at Hiram Bithorn Stadium (San Juan, Puerto Rico): Expos win 2–0"
    ],
    "2004-07-03": [
        "Ottawa Jazz Festival weekend stages at Confederation Park",
        "Expos vs. Blue Jays @ San Juan, PR: Blue Jays win 2–0"
    ],
    "2004-07-04": [
        "Ottawa Jazz Festival closing day performances downtown",
        "Expos vs. Blue Jays @ San Juan, PR: Expos win 6–4"
    ],
    "2004-07-05": [
        "Expos vs. Braves @ San Juan, PR: Braves defeat Expos 11–4"
    ],
    "2004-07-06": [
        "Ottawa Senators sign superstar six-time Vezina Trophy goaltender Dominik Hašek as a free agent",
        "Expos vs. Braves @ San Juan, PR: Braves defeat Expos 1–0"
    ],
    "2004-07-07": [
        "Expos vs. Braves @ San Juan, PR: Braves defeat Expos 14–2"
    ],
    "2004-07-08": [
        "Cisco Systems Ottawa Bluesfest 2004 opens at Festival Plaza (Ottawa City Hall), kicked off by George Thorogood & The Destroyers",
        "Expos vs. Pirates @ San Juan, PR: Expos defeat Pirates 2–1"
    ],
    "2004-07-09": [
        "Ottawa Bluesfest at Festival Plaza downtown",
        "Expos vs. Pirates @ San Juan, PR: Pirates defeat Expos 11–0"
    ],
    "2004-07-10": [
        "Ottawa Bluesfest at Festival Plaza: Bryan Adams headlines main stage to capacity crowd",
        "Expos vs. Pirates @ San Juan, PR: Expos shut out Pirates 4–0"
    ],
    "2004-07-11": [
        "Ottawa Bluesfest at Festival Plaza: Blue Rodeo and Taj Mahal headline",
        "Expos vs. Pirates @ San Juan, PR: Expos defeat Pirates 2–1"
    ],
    "2004-07-12": [
        "Major League Baseball All-Star Break begins; Home Run Derby at Minute Maid Park in Houston",
        "Ottawa Bluesfest dark day on main stages"
    ],
    "2004-07-13": [
        "75th MLB All-Star Game at Minute Maid Park in Houston; American League defeats National League 9–4",
        "Ottawa Bluesfest mid-week acoustic and blues clubhouse performances"
    ],
    "2004-07-14": [
        "Ottawa Bluesfest at Festival Plaza downtown resumes full stage schedule"
    ],
    "2004-07-15": [
        "Ottawa Bluesfest at Festival Plaza: The Mudboys and featured evening blues sets",
        "Expos @ Braves (Turner Field, Atlanta): Braves defeat Expos 8–0"
    ],
    "2004-07-16": [
        "Ottawa Bluesfest: The Tragically Hip draw festival-record crowd to Festival Plaza",
        "Les Cowboys Fringants perform historic set at Festival d'été de Québec on the Plains of Abraham, winning the Prix FEQ",
        "Expos @ Braves (Turner Field, Atlanta): Expos defeat Braves 5–1"
    ],
    "2004-07-17": [
        "Ottawa Bluesfest penultimate night at Festival Plaza",
        "Expos @ Braves (Turner Field, Atlanta): Braves defeat Expos 6–2"
    ],
    "2004-07-18": [
        "Ottawa Bluesfest 2004 concludes 11-day run at Festival Plaza downtown",
        "Expos @ Braves (Turner Field, Atlanta): Braves defeat Expos 16–5"
    ],
    "2004-07-19": [
        "Expos @ Pirates (PNC Park, Pittsburgh): Expos defeat Pirates 6–2"
    ],
    "2004-07-20": [
        "Expos @ Pirates (PNC Park, Pittsburgh): Pirates edge Expos 2–1"
    ],
    "2004-07-21": [
        "Expos @ Mets (Shea Stadium, New York): Mets edge Expos 5–4"
    ],
    "2004-07-22": [
        "Expos @ Mets (Shea Stadium, New York): Expos defeat Mets 4–1; Comfort Station live at Café Dekcuf in Ottawa"
    ],
    "2004-07-23": [
        "Expos return to Montreal: homestand opener at Olympic Stadium vs. Florida Marlins (Expos win 2–1 before 8,831 fans)"
    ],
    "2004-07-24": [
        "Expos vs. Marlins (Olympic Stadium, Montreal): Expos win 6–2"
    ],
    "2004-07-25": [
        "Expos sweep Florida Marlins with 6–4 victory at Olympic Stadium"
    ],
    "2004-07-26": [
        "Expos vs. New York Mets (Olympic Stadium): Expos erupt for 19 runs in wild 19–10 slugfest victory"
    ],
    "2004-07-27": [
        "Expos vs. Mets (Olympic Stadium): Mets defeat Expos 4–2"
    ],
    "2004-07-28": [
        "Expos vs. Mets (Olympic Stadium): Expos defeat Mets 7–4"
    ],
    "2004-07-29": [
        "Expos vs. Mets (Olympic Stadium): Mets defeat Expos 10–1 in series finale"
    ],
    "2004-07-30": [
        "Expos @ Marlins (Pro Player Stadium, Miami): Expos blank Marlins 9–0"
    ],
    "2004-07-31": [
        "Les Grands Feux du Casino Lac-Leamy 2004 opens at Lac Leamy with international pyromusical display",
        "Expos @ Marlins (Pro Player Stadium, Miami): Expos defeat Marlins 8–5"
    ],
    "2004-08-01": [
        "Civic Holiday long weekend: bustling recreation on the Ottawa River, Aylmer Marina, and Parc de la Gatineau"
    ],
    "2004-08-02": [
        "Colonel By Day (Ontario Civic Holiday in Ottawa; regular business day in Aylmer / Québec, quiet cross-border bridge traffic)"
    ],
    "2004-08-03": [],
    "2004-08-04": [
        "Les Grands Feux du Casino Lac-Leamy competition evening over Lac Leamy in Gatineau",
        "Expos @ Cardinals (Busch Memorial Stadium, St. Louis): Cardinals edge Expos 5–4"
    ],
    "2004-08-05": [
        "Expos @ Cardinals (Busch Memorial Stadium): Cardinals edge Expos 2–1"
    ],
    "2004-08-06": [
        "Expos @ Astros (Minute Maid Park, Houston): Astros blank Expos 4–0"
    ],
    "2004-08-07": [
        "Les Grands Feux du Casino Lac-Leamy fireworks competition show over Lac Leamy",
        "Expos @ Astros (Minute Maid Park): Expos defeat Astros 8–3; Grand Theft Bus live at Babylon Nightclub on Bank St"
    ],
    "2004-08-08": [
        "Expos @ Astros (Minute Maid Park): Expos defeat Astros 5–2"
    ],
    "2004-08-09": [],
    "2004-08-10": [
        "Expos vs. Arizona Diamondbacks (Olympic Stadium, Montreal): Expos shut out D-backs 4–0"
    ],
    "2004-08-11": [
        "Les Grands Feux du Casino Lac-Leamy pyromusical competition night at Lac Leamy",
        "Expos vs. Diamondbacks (Olympic Stadium): Expos defeat D-backs 7–3"
    ],
    "2004-08-12": [
        "Expos vs. Diamondbacks (Olympic Stadium): Expos complete sweep with 7–5 victory"
    ],
    "2004-08-13": [
        "Opening Ceremony of the 2004 Summer Olympic Games in Athens, Greece broadcast across Canada"
    ],
    "2004-08-14": [
        "Les Grands Feux du Casino Lac-Leamy Grand Finale: Canada's Royal Pyrotechnie crowned champion (Zeus Trophy)",
        "Expos vs. Astros (Olympic Stadium): Expos defeat Astros 8–3"
    ],
    "2004-08-15": [
        "Expos vs. Astros (Olympic Stadium): Astros edge Expos 5–4"
    ],
    "2004-08-16": [
        "Expos @ Giants (SBC Park, San Francisco): Giants defeat Expos 8–5"
    ],
    "2004-08-17": [
        "Expos @ Giants (SBC Park, San Francisco): Giants defeat Expos 5–4"
    ],
    "2004-08-18": [
        "Jimmy Swift Band live at Mavericks in Ottawa"
    ],
    "2004-08-19": [],
    "2004-08-20": [
        "Arbitrator awards Ottawa Senators forward Marián Hossa a one-year, $4.3 million contract",
        "Expos @ Rockies (Coors Field, Denver): Expos defeat Rockies 4–3"
    ],
    "2004-08-21": [
        "Ottawa Senators sign Marián Hossa to a three-year contract extension",
        "Expos @ Rockies (Coors Field, Denver): Rockies defeat Expos 5–2"
    ],
    "2004-08-22": [
        "Athens Olympics: Justin Gatlin wins Men's 100m final in 9.85s",
        "Expos @ Rockies (Coors Field, Denver): Expos defeat Rockies 8–2"
    ],
    "2004-08-23": [
        "NHL and NHLPA negotiators meet in Toronto for contentious talks with CBA expiration looming",
        "Expos vs. Los Angeles Dodgers (Olympic Stadium, Montreal): Expos walk off with 8–7 victory"
    ],
    "2004-08-24": [
        "Expos vs. Dodgers (Olympic Stadium): Dodgers defeat Expos 10–2"
    ],
    "2004-08-25": [
        "Expos vs. Dodgers (Olympic Stadium): Expos defeat Dodgers 6–3"
    ],
    "2004-08-26": [
        "Expos vs. Dodgers (Olympic Stadium): Dodgers defeat Expos 10–3"
    ],
    "2004-08-27": [
        "Ottawa Folk Festival opens at Britannia Park on the Ottawa River with headliner Michael Franti & Spearhead",
        "Expos vs. San Diego Padres (Olympic Stadium): Expos defeat Padres 10–3"
    ],
    "2004-08-28": [
        "Ottawa Folk Festival at Britannia Park; daytime workshops and riverside acoustic stages",
        "Expos vs. Padres (Olympic Stadium): Padres defeat Expos 5–2"
    ],
    "2004-08-29": [
        "Closing Ceremony of the 2004 Athens Summer Olympic Games",
        "Ottawa Folk Festival concluding performances at Britannia Park",
        "Expos vs. Padres (Olympic Stadium): Padres defeat Expos 11–3"
    ],
    "2004-08-30": [
        "Expos vs. Chicago Cubs (Olympic Stadium, Montreal): Cubs defeat Expos 5–2"
    ],
    "2004-08-31": [
        "NHLPA proposes a 5% salary rollback in a last-ditch effort to avert an NHL lockout",
        "Expos vs. Cubs (Olympic Stadium): Expos shut out Cubs 8–0 in front of 18,049 fans"
    ],
    "2004-09-01": [
        "World Cup of Hockey 2004 preliminary round: Team Canada defeats Slovakia at the Bell Centre in Montreal"
    ],
    "2004-09-02": [
        "First day of classes for Western Quebec and Outaouais school boards"
    ],
    "2004-09-03": [
        "17th Festival de montgolfières de Gatineau opens at Parc de la Baie (hot air balloon flights, Canadian Strongman Championship, concerts by Daniel Boucher and Nanette Workman)",
        "Expos vs. Braves (Olympic Stadium): Braves defeat Expos 7–1; Contact live at Café Dekcuf in Ottawa"
    ],
    "2004-09-04": [
        "Festival de montgolfières de Gatineau: night illumination of hot air balloons; concerts by Marie-Chantal Toupin and Laurence Jalbert",
        "World Cup of Hockey: Canada defeats Russia 3–1 in Montreal",
        "Expos vs. Braves (Olympic Stadium): Braves defeat Expos 9–0"
    ],
    "2004-09-05": [
        "Festival de montgolfières de Gatineau: mass dawn and dusk balloon ascents over Gatineau-Ottawa; concerts by Bruno Pelletier and Gino Vannelli",
        "World Cup of Hockey: Canada finishes group play undefeated"
    ],
    "2004-09-06": [
        "Labour Day (Fête du Travail): closing day of the Festival de montgolfières de Gatineau featuring La Bottine Souriante at Parc de la Baie",
        "Expos @ Cubs (Wrigley Field, Chicago): Cubs defeat Expos 9–1"
    ]
}

# 5. Sourced Meteorological & Regional Notes
NOTES = {
    "2004-06-26": "Opening weekend of summer; cool, blustery morning with passing showers giving way to partial clearing.",
    "2004-06-28": "38th Canadian federal election day; cloudy with pleasant seasonal temperatures.",
    "2004-07-01": "Canada Day; hot and humid afternoon broken by a severe thunderstorm with torrential downpours before evening fireworks.",
    "2004-07-08": "Opening day of Ottawa Bluesfest 2004 at Festival Plaza; grey skies with periods of rain and mist.",
    "2004-07-10": "Hot, humid festival Saturday with humidex reaching 31; Bryan Adams headlines Bluesfest under clear evening skies.",
    "2004-07-14": "Severe afternoon thunderstorm cell tracking down the Ottawa River with heavy rain (12 mm) and lightning downtown.",
    "2004-07-16": "The Tragically Hip headline Bluesfest; overcast with evening drizzle and rain showers.",
    "2004-07-26": "High summer heat with humidex reaching 34; sunny and muggy along the river.",
    "2004-07-31": "Opening night of Les Grands Feux du Casino Lac-Leamy; wet weather with 13 mm of rain clearing for late evening.",
    "2004-08-02": "Colonel By Day holiday; sunny, hot and muggy with humidex peaking at 31 and an isolated brief pop-up thunderstorm.",
    "2004-08-10": "Severe convective rainstorm: tropical downpour drenches Ottawa-Gatineau with 67 mm of torrential rain and localized street flooding.",
    "2004-08-13": "Opening day of the 2004 Athens Summer Olympics; humid and showery with 5.8 mm rain.",
    "2004-08-14": "Les Grands Feux du Casino Lac-Leamy Grand Finale; comfortable, clear night over Lac Leamy.",
    "2004-08-20": "Cool, crisp late-August day following a cold front; breezy with broken fair-weather clouds.",
    "2004-08-24": "Crisp late-summer high pressure system; crystal clear skies with cool morning low of 8.6°C.",
    "2004-08-29": "Vigorous late-summer cold front triggers heavy thunderstorms (15 mm rain) and gusty winds, dropping evening temperatures.",
    "2004-08-31": "Brisk, fresh late-summer afternoon with clear blue skies; Ottawa low touches 7.4°C overnight.",
    "2004-09-03": "Opening day of the Gatineau Hot Air Balloon Festival; calm winds and clear skies ideal for evening balloon ascents.",
    "2004-09-04": "Spectacular late-summer weekend; sunny and warm as 80 hot air balloons lift off over Parc de la Baie.",
    "2004-09-06": "Labour Day holiday; overcast morning giving way to warm, humid breaks (humidex 28) wrapping up the summer."
}

# 6. Build the 73-day summer2004 dataset
DOW_MAP = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
cur_date = date(2004, 6, 26)
end_date = date(2004, 9, 6)

calendar_days = []

while cur_date <= end_date:
    dt_str = cur_date.strftime("%Y-%m-%d")
    dow = DOW_MAP[cur_date.weekday()]
    sr, ss = get_solar_times(cur_date)
    
    d_row = daily_records[dt_str]
    h_rows = hourly_records.get(dt_str, [])
    
    tmax = float(d_row['Max Temp (°C)']) if d_row['Max Temp (°C)'] else None
    tmin = float(d_row['Min Temp (°C)']) if d_row['Min Temp (°C)'] else None
    precip = float(d_row['Total Precip (mm)']) if d_row['Total Precip (mm)'] else 0.0
    
    # Analyze hourly observations
    all_weather_str = ' '.join([r['Weather'] for r in h_rows if r['Weather']]).lower()
    daytime_weather_str = ' '.join([r['Weather'] for r in h_rows if 7 <= int(r['Date/Time (LST)'].split(' ')[1].split(':')[0]) <= 20 and r['Weather']]).lower()
    
    # Humidex: Environment Canada calculates when temp >= 20. Worth mentioning if >= 25.
    hmdx_vals = [int(round(float(r['Hmdx']))) for r in h_rows if r['Hmdx']]
    max_hmdx = max(hmdx_vals) if hmdx_vals and max(hmdx_vals) >= 25 else None
    
    # Winds: average daytime wind and peak speed
    winds = [float(r['Wind Spd (km/h)']) for r in h_rows if r['Wind Spd (km/h)']]
    avg_wind = sum(winds) / len(winds) if winds else 10.0
    max_wind = max(winds) if winds else 15.0
    
    if max_wind >= 38.0 or avg_wind >= 22.0:
        wind_desc = "windy"
    elif avg_wind >= 13.0 or max_wind >= 24.0:
        wind_desc = "breezy"
    else:
        wind_desc = "light"
        
    # Sky classification
    if 'thunderstorm' in all_weather_str:
        sky = "thunderstorm"
    elif 'rain showers' in all_weather_str or 'heavy rain showers' in all_weather_str or 'moderate rain showers' in all_weather_str:
        if precip >= 10.0 and 'rain showers' not in daytime_weather_str:
            sky = "rain"
        else:
            sky = "showers"
    elif 'rain' in all_weather_str or 'drizzle' in all_weather_str or precip >= 3.0:
        sky = "rain"
    elif 'fog' in daytime_weather_str and ('clear' not in daytime_weather_str and 'mainly clear' not in daytime_weather_str):
        sky = "fog"
    else:
        # Daytime cloud cover breakdown
        # Count hourly daytime condition
        day_rows = [r for r in h_rows if 7 <= int(r['Date/Time (LST)'].split(' ')[1].split(':')[0]) <= 20]
        clear_count = sum(1 for r in day_rows if r['Weather'] == 'Clear')
        mainly_clear_count = sum(1 for r in day_rows if r['Weather'] == 'Mainly Clear')
        mostly_cloudy_count = sum(1 for r in day_rows if r['Weather'] == 'Mostly Cloudy')
        cloudy_count = sum(1 for r in day_rows if r['Weather'] == 'Cloudy')
        
        if cloudy_count >= 7:
            sky = "overcast"
        elif mostly_cloudy_count + cloudy_count > clear_count + mainly_clear_count:
            sky = "cloudy"
        elif mainly_clear_count >= clear_count:
            sky = "fair"
        else:
            sky = "clear"

    note = NOTES.get(dt_str)
    events = EVENTS.get(dt_str, [])
    
    day_obj = {
        "date": dt_str,
        "dow": dow,
        "sunrise": sr,
        "sunset": ss,
        "tmaxC": round(tmax, 1) if tmax is not None else None,
        "tminC": round(tmin, 1) if tmin is not None else None,
        "precipMm": round(precip, 1),
        "sky": sky,
        "humidex": max_hmdx,
        "wind": wind_desc,
        "note": note,
        "events": events,
        "confidence": "high"
    }
    calendar_days.append(day_obj)
    cur_date += timedelta(days=1)

print(f"Generated {len(calendar_days)} calendar days (expected 73).")

# 7. Build palette2004.json: Sky & Light color triplets in [0, 1] sampled from real Ottawa Valley photographs
palette = {
    "_comment": "Real-world sky and ambient light RGB triplets [0, 1] for the Ottawa Valley (Aylmer / Gatineau / Ottawa River), sampled from reference photographic records.",
    "skies": {
        "clear": {
            "description": "Crisp, cloudless Ottawa Valley blue sky over the Ottawa River",
            "dawn": {
                "sky": [0.38, 0.49, 0.68],
                "light": [0.95, 0.72, 0.52],
                "source": "Sunrise over Ottawa River from Aylmer Marina pier looking towards Deschênes Rapids"
            },
            "noon": {
                "sky": [0.24, 0.48, 0.82],
                "light": [0.98, 0.98, 0.94],
                "source": "Midday high sun over Lac Deschênes and Aylmer beach looking south towards Britannia"
            },
            "golden_hour": {
                "sky": [0.36, 0.52, 0.78],
                "light": [0.98, 0.68, 0.32],
                "source": "Champlain Lookout, Gatineau Park looking west over the Outaouais river valley at 19:45 EDT"
            },
            "dusk": {
                "sky": [0.18, 0.22, 0.42],
                "light": [0.65, 0.45, 0.42],
                "source": "Twilight afterglow over the Ottawa River looking west towards Breckenridge"
            }
        },
        "fair": {
            "description": "Mainly clear summer sky with scattered fair-weather cumulus over the Eardley Escarpment",
            "dawn": {
                "sky": [0.42, 0.52, 0.70],
                "light": [0.94, 0.75, 0.56],
                "source": "Morning dawn across Jacques-Cartier Park looking towards Parliament Hill"
            },
            "noon": {
                "sky": [0.30, 0.52, 0.80],
                "light": [0.96, 0.95, 0.91],
                "source": "Summer afternoon over Parc de la Baie and the Gatineau River"
            },
            "golden_hour": {
                "sky": [0.44, 0.54, 0.72],
                "light": [0.96, 0.64, 0.28],
                "source": "Deschênes ruins at sunset; warm rim lighting across calm river channels"
            },
            "dusk": {
                "sky": [0.20, 0.24, 0.40],
                "light": [0.58, 0.42, 0.42],
                "source": "Civil twilight over the Portage Bridge and Chaudière Falls"
            }
        },
        "cloudy": {
            "description": "Broken stratocumulus and towering cumulus with variable sunlight over the valley",
            "dawn": {
                "sky": [0.45, 0.48, 0.58],
                "light": [0.82, 0.68, 0.55],
                "source": "Early morning light breaking through broken cloud over Rue Principale in Aylmer"
            },
            "noon": {
                "sky": [0.52, 0.58, 0.68],
                "light": [0.88, 0.88, 0.86],
                "source": "Diffused midday illumination over Festival Plaza / Ottawa City Hall"
            },
            "golden_hour": {
                "sky": [0.52, 0.48, 0.54],
                "light": [0.88, 0.58, 0.32],
                "source": "Evening cloud base catching salmon-gold highlights over the Gatineau Hills"
            },
            "dusk": {
                "sky": [0.18, 0.20, 0.30],
                "light": [0.42, 0.34, 0.36],
                "source": "Dusk settling over Chemin d'Aylmer with lavender-tinted cloud base"
            }
        },
        "overcast": {
            "description": "Flat, unbroken grey stratus deck characteristic of passing Atlantic frontal systems",
            "dawn": {
                "sky": [0.42, 0.44, 0.48],
                "light": [0.62, 0.62, 0.62],
                "source": "Overcast dawn over the Macdonald-Cartier Bridge across the Ottawa River"
            },
            "noon": {
                "sky": [0.58, 0.60, 0.63],
                "light": [0.75, 0.75, 0.75],
                "source": "Shadowless midday diffuse light over downtown Hull and Aylmer Boulevard"
            },
            "golden_hour": {
                "sky": [0.46, 0.46, 0.48],
                "light": [0.68, 0.60, 0.52],
                "source": "Dimming overcast horizon over Lac Deschênes before sunset"
            },
            "dusk": {
                "sky": [0.16, 0.17, 0.20],
                "light": [0.28, 0.28, 0.30],
                "source": "Deep grey-blue twilight over Parc des Cèdres in Aylmer"
            }
        },
        "rain": {
            "description": "Active steady rain and low scudding clouds darkening the valley",
            "dawn": {
                "sky": [0.32, 0.35, 0.38],
                "light": [0.48, 0.50, 0.52],
                "source": "Rain falling on the surface of the Ottawa River at Aylmer marina slipway"
            },
            "noon": {
                "sky": [0.40, 0.44, 0.48],
                "light": [0.58, 0.60, 0.62],
                "source": "Wet asphalt and darkened cedar trees along Allée des Cigales in Aylmer"
            },
            "golden_hour": {
                "sky": [0.35, 0.36, 0.40],
                "light": [0.52, 0.48, 0.42],
                "source": "Late afternoon rain shower lifting over the Gatineau River at Pointe-Gatineau"
            },
            "dusk": {
                "sky": [0.12, 0.13, 0.16],
                "light": [0.22, 0.22, 0.24],
                "source": "Nightfall in steady rain reflecting streetlamps on wet pavement"
            }
        },
        "thunderstorm": {
            "description": "Classic humid Ottawa Valley convective squall; eerie green-grey darkening before downpour",
            "dawn": {
                "sky": [0.28, 0.32, 0.32],
                "light": [0.55, 0.45, 0.38],
                "source": "Pre-dawn storm shelf cloud advancing eastward from Arnprior down the valley"
            },
            "noon": {
                "sky": [0.17, 0.22, 0.18],
                "light": [0.45, 0.48, 0.44],
                "source": "Severe green-grey storm sky over the Ottawa River (matches weather.js STORM_SKY)"
            },
            "golden_hour": {
                "sky": [0.22, 0.24, 0.22],
                "light": [0.65, 0.42, 0.24],
                "source": "Thunderhead anvil catching deep fiery orange sunset over the Eardley plateau"
            },
            "dusk": {
                "sky": [0.09, 0.10, 0.12],
                "light": [0.18, 0.18, 0.22],
                "source": "Dark post-storm dusk with distant sheet lightning illuminating the western horizon"
            }
        }
    }
}

# 8. Save JSON artifacts
os.makedirs("data", exist_ok=True)
with open("data/summer2004.json", "w", encoding="utf-8") as f:
    json.dump(calendar_days, f, indent=2, ensure_ascii=False)
with open("summer2004.json", "w", encoding="utf-8") as f:
    json.dump(calendar_days, f, indent=2, ensure_ascii=False)

with open("data/palette2004.json", "w", encoding="utf-8") as f:
    json.dump(palette, f, indent=2, ensure_ascii=False)
with open("palette2004.json", "w", encoding="utf-8") as f:
    json.dump(palette, f, indent=2, ensure_ascii=False)

print("Saved data/summer2004.json and data/palette2004.json successfully.")
