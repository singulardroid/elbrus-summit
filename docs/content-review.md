# Content review (phase 5)

Everything a visitor reads in the 3D map, collected for review. The texts are **drafts written by Claude** from general knowledge and OpenStreetMap data, so please check them before they go public, ideally with someone who knows the region (a local guide or mountaineering club).

How to change things:

- Place texts, names, heights: `content/pois.geojson`
- Routes (texts, stages, which OSM ways they follow): `content/routes.yaml`, then run `pipeline/build_routes.py`
- Then refresh the viewer data: `pipeline/build_web.py --skip-tiles` (≈ 1 s)

## Decisions needed

1. **Photos**: none yet. Each place has an `image` field (URL or path). Photos need to be your own or licensed for reuse (e.g. Wikimedia Commons with attribution). The panel shows them above the description.
2. **Places**: 18 now. Add or remove any? Candidates in the OSM data: LeapRus hut, Garabashi/Pokoritel huts, the old Krugosor station, Lake Donguz-Orun, Sultan waterfall, Cheget lift stations.
3. **Garabashi**: now points at the gondola top station (3,847 m). OK, or should it be the old chairlift top by the Bochki?
4. **Pastukhov Rocks**: position estimated (~4,700 m on the trail). Please confirm or give coordinates.
5. **Northern route start**: the OSM path starts ~1 km west of the Jily-Su marker. Fine as is, or extend it?
6. **Route safety note**: every route panel says *“For orientation only, not for navigation…”*. Keep the wording?

## Places

Elevations shown are the `elevation_m` values (from OSM where available). The terrain model itself is ~10–60 m lower on sharp peaks, which is normal for 30 m elevation data.

### Elbrus West Summit / Западная вершина Эльбруса  (`west-summit`)

summit · 5642 m · 43.35241° N, 42.43784° E · source `osm:node/281936304`

> **EN** The highest point of Elbrus and of Russia, and by the most common definition the highest summit in Europe, which makes it one of the Seven Summits. Elbrus is a dormant volcano whose two summits stand less than 1.5 km apart. The West Summit was first climbed in 1874 by a British party with local guides.
>
> **RU** Высшая точка Эльбруса и России, а по самому распространённому определению и всей Европы, поэтому она входит в список «Семи вершин». Эльбрус — спящий вулкан, его две вершины разделяют менее полутора километров. Западную вершину впервые покорили в 1874 году британские альпинисты вместе с местными проводниками.

Check:
- [ ] Highest in Europe 'by the most common definition' (depends on the Europe–Asia boundary)
- [ ] Two summits less than 1.5 km apart (model: 1.4 km)
- [ ] First ascent 1874 by a British party with local guides (Grove, Walker, Gardner, guide Peter Knubel; Akhia Sottaev is often credited too)

### Elbrus East Summit / Восточная вершина Эльбруса  (`east-summit`)

summit · 5621 m · 43.34679° N, 42.45390° E · source `osm:node/281936405`

> **EN** The slightly lower of the two summits, on the rim of the old volcanic crater. It was climbed first: in 1829 Khillar Khachirov reached it during a Russian scientific expedition. The northern route usually leads here.
>
> **RU** Чуть более низкая из двух вершин, на краю древнего кратера. Её покорили первой: в 1829 году на неё поднялся Хиллар Хачиров, участник российской научной экспедиции. Северный маршрут обычно ведёт именно сюда.

Check:
- [ ] Rim of the old volcanic crater
- [ ] First ascent 1829 by Khillar Khachirov (spelling varies: Killar Khashirov) during a Russian scientific expedition
- [ ] The northern route usually leads to the East Summit

### Elbrus Saddle / Седловина Эльбруса  (`saddle`)

saddle · 5373 m · 43.35041° N, 42.44731° E · source `osm:node/1834897336`

> **EN** The broad snow col between the two summits. On the southern route climbers reach it after the long diagonal traverse, rest, and then climb the steep final slope to the West Summit.
>
> **RU** Широкая снежная седловина между двумя вершинами. На южном маршруте сюда выходят после длинного траверса «Косая полка», отдыхают и затем поднимаются по крутому склону на Западную вершину.

Check:
- [ ] Elevation 5,373 m is from OSM; other sources give ~5,300–5,416 m

### Pastukhov Rocks / Скалы Пастухова  (`pastukhov-rocks`)

viewpoint · 4700 m (approx.) · 43.33190° N, 42.45790° E · source `manual`

> **EN** A band of dark rocks on the south slope and a common turnaround point for acclimatisation hikes. They are named after Andrey Pastukhov, a military topographer who climbed Elbrus in the 1890s and camped here. The marker position is approximate.
>
> **RU** Гряда тёмных скал на южном склоне — частая точка разворота акклиматизационных выходов. Названы в честь военного топографа Андрея Пастухова, поднимавшегося на Эльбрус в 1890-х и ночевавшего здесь. Положение метки приблизительное.

Check:
- [ ] **Position is estimated** (placed where the OSM trail crosses ~4,700 m)
- [ ] Named after military topographer Andrey Pastukhov, who climbed Elbrus in the 1890s and camped here

### Priyut 11 / Diesel Hut / Приют 11 / Дизель-хат  (`priyut-11`)

hut · 4130 m · 43.31390° N, 42.45927° E · source `osm:node/4398608907`

> **EN** The site of Priyut 11, the legendary mountain hotel built in 1939 that burned down in 1998. The nearby Diesel Hut, once the hotel's power-plant building, was turned into a climbers' shelter and remains a key base on the southern route.
>
> **RU** Место легендарного «Приюта одиннадцати» — высокогорной гостиницы, построенной в 1939 году и сгоревшей в 1998-м. Соседнее здание бывшей дизельной электростанции («Дизель-хат») переоборудовано в приют и остаётся важной базой южного маршрута.

Check:
- [ ] Hotel built in 1939, burned down in 1998
- [ ] Diesel Hut was the hotel's power-plant building

### Garabashi station / Станция Гарабаши  (`garabashi`)

lift · 3847 m · 43.30423° N, 42.46021° E · source `osm:node/2713826816`

> **EN** The top station of the Elbrus cable cars and the end of the lift system on the south slope. From here climbers continue on foot or by snowcat towards the huts and Pastukhov Rocks. Several huts, including the Bochki barrels, are close by.
>
> **RU** Верхняя станция канатных дорог «Эльбрус» на южном склоне. Дальше — пешком или на ратраке к приютам и скалам Пастухова. Рядом несколько приютов, в том числе знаменитые «Бочки».

Check:
- [ ] **Changed in phase 5**: now the Elbrus-3 gondola top station (3,847 m, OSM), not the old chairlift top (3,780 m) next to the Bochki
- [ ] 'Continue on foot or by snowcat'

### Bochki huts / Бочки  (`bochki`)

hut · 3710 m · 43.29894° N, 42.46406° E · source `osm:node/93717447`

> **EN** A group of barrel-shaped huts ('bochki' means 'barrels') that has long served as an acclimatisation base for climbers on the southern route.
>
> **RU** Группа приютов в форме цилиндрических бочек — давняя база для акклиматизации альпинистов на южном маршруте.

Check:
- [ ] Long-standing acclimatisation base; still in operation?

### Mir station / Станция Мир  (`mir`)

lift · 3500 m · 43.28906° N, 42.46072° E · source `osm:node/93715722`

> **EN** The middle station of the south-side cable cars. It also houses a small museum about the defence of the Elbrus region in the Second World War, when these slopes were a front line.
>
> **RU** Средняя станция канатных дорог южного склона. Здесь же небольшой музей обороны Приэльбрусья: в годы Великой Отечественной войны эти склоны были линией фронта.

Check:
- [ ] Museum of the defence of the Elbrus region (WWII) at Mir station

### Krugosor station / Станция Кругозор  (`krugosor`)

lift · 3000 m · 43.27433° N, 42.46046° E · source `osm:node/858178597`

> **EN** The first station above Azau. The name means 'panorama', and the platform lives up to it, looking across the Baksan valley to Donguz-Orun and the Main Caucasus Ridge.
>
> **RU** Первая станция над Азау. Название говорит само за себя: отсюда открывается панорама Баксанского ущелья, Донгуз-Оруна и Главного Кавказского хребта.

Check:
- [ ] Views from the platform to Donguz-Orun and the Main Ridge

### Azau / Поляна Азау  (`azau`)

lift · 2350 m · 43.26577° N, 42.47930° E · source `osm:node/456533130`

> **EN** Azau Glade at the head of the Baksan valley, where the road ends and the cable cars to Elbrus begin. Hotels, cafés and the lower lifts of the ski area are clustered here.
>
> **RU** Поляна Азау в верховьях Баксанского ущелья: здесь заканчивается дорога и начинаются канатные дороги на Эльбрус. Рядом гостиницы, кафе и нижние подъёмники горнолыжного курорта.

### Terskol / Терскол  (`terskol`)

village · (from terrain) m · 43.25608° N, 42.51324° E · source `osm:node/2113301644`

> **EN** The main village of the upper Baksan valley, a few kilometres below Azau. Most visitors to the Elbrus region stay here or at nearby Cheget Glade.
>
> **RU** Главный посёлок верхней части Баксанского ущелья, в нескольких километрах ниже Азау. Большинство гостей Приэльбрусья живут здесь или на соседней поляне Чегет.

### Terskol Peak Observatory / Обсерватория Пик Терскол  (`terskol-observatory`)

viewpoint · 3150 m · 43.27670° N, 42.49972° E · source `osm:node/2112161426`

> **EN** A high-altitude astronomical observatory on Terskol Peak, above the village. The thin, dry air at this height gives good observing conditions.
>
> **RU** Высокогорная астрономическая обсерватория на пике Терскол над посёлком. Разрежённый сухой воздух на такой высоте даёт хорошие условия для наблюдений.

Check:
- [ ] High-altitude astronomical observatory on Terskol Peak (operator not named on purpose)

### Cheget Glade / Поляна Чегет  (`cheget-glade`)

village · (from terrain) m · 43.24510° N, 42.52290° E · source `osm:node/93685973`

> **EN** The glade at the foot of Mount Cheget, with the lower stations of the Cheget chairlifts, hotels and a souvenir market.
>
> **RU** Поляна у подножия горы Чегет: нижние станции кресельных подъёмников, гостиницы и сувенирный рынок.

### Cheget / Чегет  (`cheget`)

summit · 3461 m · 43.24128° N, 42.48318° E · source `osm:node/995954766`

> **EN** Across the valley from Elbrus, Cheget is known for steep ski runs and for one of the best views of Elbrus's twin summits. Chairlifts run most of the way up from Cheget Glade.
>
> **RU** Гора напротив Эльбруса, известная крутыми горнолыжными трассами и одним из лучших видов на двуглавый Эльбрус. Кресельные подъёмники идут от поляны Чегет почти до вершины.

Check:
- [ ] Chairlifts run 'most of the way up' (top lift station ~3,050 m vs summit 3,461 m)
- [ ] OSM labels another peak 'Cheget' in English (actually Maly Donguzorun, 3,769 m); we use the 3,461 m point named Чегет

### Donguzorun / Донгуз-Орун  (`donguzorun`)

summit · 4454 m · 43.19481° N, 42.51455° E · source `osm:node/427960778`

> **EN** Donguz-Orun stands on the Main Caucasus Ridge, which forms the border with Georgia here. Its steep north face above the Baksan valley carries a hanging glacier shaped like the figure 7, the famous 'Semyorka'.
>
> **RU** Донгуз-Орун стоит на Главном Кавказском хребте, по которому здесь проходит граница с Грузией. На его крутой северной стене над Баксанским ущельем висит ледник в форме цифры 7 — знаменитая «Семёрка».

Check:
- [ ] Main Caucasus Ridge forms the Russia–Georgia border here
- [ ] Hanging glacier shaped like a 7 ('Semyorka') on the north face

### Nakratau / Накратау  (`nakratau`)

summit · 4269 m · 43.20010° N, 42.49500° E · source `osm:node/427960773`

> **EN** A peak on the Main Caucasus Ridge next to Donguz-Orun. Together they form the wall that closes the view to the south from Cheget.
>
> **RU** Вершина Главного Кавказского хребта рядом с Донгуз-Оруном. Вместе они образуют стену, замыкающую вид на юг с Чегета.

Check:
- [ ] 'Together they form the wall that closes the view to the south from Cheget'

### Jily-Su / Джилы-Су  (`jily-su`)

village · (from terrain) m · 43.43548° N, 42.53804° E · source `osm:node/3749226801`

> **EN** An area on the north side of Elbrus with mineral springs and waterfalls, including the Sultan waterfall. It is the starting point of the northern route, which is wilder and quieter than the southern one and has no lifts.
>
> **RU** Урочище на северной стороне Эльбруса с минеральными источниками и водопадами, в том числе водопадом Султан. Отсюда начинается северный маршрут — более дикий и безлюдный, чем южный, без подъёмников.

Check:
- [ ] Mineral springs and waterfalls, incl. the Sultan waterfall
- [ ] Northern route has no lifts

### North base camp (Lakkolit) / Северный приют (Лакколит)  (`north-hut`)

hut · 3765 m · 43.38900° N, 42.47809° E · source `osm:node/5292248340`

> **EN** Huts of the northern base camp near the Lakkolit rocks. Climbers on the northern route acclimatise here before the long summit day to the East Summit.
>
> **RU** Приюты северного базового лагеря у скал Лакколит. Здесь акклиматизируются перед долгим штурмовым днём на Восточную вершину по северному маршруту.

Check:
- [ ] Name and location of the northern base camp (OSM: Приют Лакколит, 3,765 m)

## Routes

### Southern route (classic) / Южный маршрут (классика)  (`south-route`)

Computed from the terrain model: 11.8 km in total, 6.6 km on foot, 1,784 m ascent on foot, highest point 5,642 m.

> **EN** The most popular way up Elbrus. Three cable cars lift you from Azau to Garabashi at about 3,850 m. From there the route climbs the broad south slope past the huts and Pastukhov Rocks, crosses the long diagonal traverse to the saddle and finishes on the West Summit. Technically straightforward but serious: altitude, cold and sudden whiteouts are the real dangers, so acclimatisation and a guide are strongly advised.
>
> **RU** Самый популярный путь на Эльбрус. Три канатные дороги поднимают от Азау до Гарабаши (около 3850 м). Дальше маршрут идёт по широкому южному склону мимо приютов и скал Пастухова, по длинному траверсу «Косая полка» выходит на седловину и заканчивается на Западной вершине. Технически несложен, но серьёзен: главные опасности — высота, холод и внезапная потеря видимости, поэтому нужны акклиматизация и, желательно, гид.

| Stage | Mode | OSM ways | Length | Heights |
|---|---|---|---|---|
| Elbrus-1 gondola: Azau → Krugosor | lift | [101262111](https://www.openstreetmap.org/way/101262111) | 1.7 km | 2,350 → 3,000 m |
| Elbrus-2 gondola: Krugosor → Mir | lift | [72200843](https://www.openstreetmap.org/way/72200843) | 1.8 km | 3,000 → 3,500 m |
| Elbrus-3 gondola: Mir → Garabashi | lift | [265771549](https://www.openstreetmap.org/way/265771549) | 1.7 km | 3,500 → 3,847 m |
| South trail past the huts to Pastukhov Rocks and above | foot | [226056643](https://www.openstreetmap.org/way/226056643) | 4.1 km | 3,847 → 5,033 m |
| Diagonal traverse (Kosaya Polka) to the saddle | foot | [226056654](https://www.openstreetmap.org/way/226056654) | 1.4 km | 5,033 → 5,373 m |
| Final climb to the West Summit | foot | [1365327953](https://www.openstreetmap.org/way/1365327953), [46931794](https://www.openstreetmap.org/way/46931794) | 1.1 km | 5,373 → 5,642 m |

Check:
- [ ] Three cable cars Azau → Krugosor → Mir → Garabashi (OSM ways listed below)
- [ ] Garabashi 'about 3,850 m'
- [ ] Route description order: huts → Pastukhov Rocks → diagonal traverse → saddle → West Summit
- [ ] 'Technically straightforward but serious… a guide is strongly advised'
- [ ] Line follows the real route on the map (open the viewer at `#route=south-route`)

### Northern route / Северный маршрут  (`north-route`)

Computed from the terrain model: 13.6 km in total, 13.6 km on foot, 3,138 m ascent on foot, highest point 5,621 m.

> **EN** The wilder approach from Jily-Su: no lifts, a long walk-in to the north base camp near the Lakkolit rocks, and a long summit day up the glacier to the East Summit.
>
> **RU** Более дикий подход от Джилы-Су: без подъёмников, долгий путь к северному базовому лагерю у скал Лакколит и длинный штурмовой день по леднику к Восточной вершине.

| Stage | Mode | OSM ways | Length | Heights |
|---|---|---|---|---|
| Walk-in from Jily-Su to the north base camp | foot | [1315339940](https://www.openstreetmap.org/way/1315339940), [245197306](https://www.openstreetmap.org/way/245197306), [1315339941](https://www.openstreetmap.org/way/1315339941), [971695910](https://www.openstreetmap.org/way/971695910), [437923506](https://www.openstreetmap.org/way/437923506), [437923505](https://www.openstreetmap.org/way/437923505), [245197317](https://www.openstreetmap.org/way/245197317), [767336212](https://www.openstreetmap.org/way/767336212) | 8.0 km | 2,509 → 3,765 m |
| North slope to the East Summit | foot | [56131844](https://www.openstreetmap.org/way/56131844) | 5.6 km | 3,765 → 5,621 m |

Check:
- [ ] No lifts on the north side
- [ ] Base camp near the Lakkolit rocks; summit day to the East Summit
- [ ] Line follows the real route on the map (open the viewer at `#route=north-route`)

## Licensing note

Route geometry and place coordinates are derived from OpenStreetMap (ODbL). Attribution is shown in the viewer. If the route/place data is published as a dataset, it must stay under ODbL. The texts themselves are original drafts.
