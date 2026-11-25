/**
 * Interface languages: Russian, English, Chinese, Arabic (right-to-left).
 *
 * - `t(key, params)` looks a string up in the current language, falling back to English, then Russian.
 * - `plural(key, n)` picks the plural form with Intl.PluralRules (Russian one/few/many, etc.).
 * - Static markup carries `data-i18n="key"` (text), `data-i18n-aria` and `data-i18n-title`;
 *   `applyI18n(root)` fills them. Components that build text in code subscribe with `onLang`.
 * - The language comes from `?lang=`, then the saved choice, then the browser, else English.
 *
 * Content (place names, stories) is localised in the data itself: `{ ru, en, zh, ar }` objects,
 * read with `loc()`.
 */

export type Lang = 'ru' | 'en' | 'zh' | 'ar';

export const LANGS: { id: Lang; name: string; short: string; locale: string; dir: 'ltr' | 'rtl' }[] = [
  { id: 'ru', name: 'Русский', short: 'RU', locale: 'ru-RU', dir: 'ltr' },
  { id: 'en', name: 'English', short: 'EN', locale: 'en-GB', dir: 'ltr' },
  { id: 'zh', name: '中文', short: '中文', locale: 'zh-CN', dir: 'ltr' },
  // Western digits, as on the stones and in the route strip.
  { id: 'ar', name: 'العربية', short: 'عربي', locale: 'ar-u-nu-latn', dir: 'rtl' },
];

type Dict = Record<string, string>;
type PluralDict = Record<string, Partial<Record<Intl.LDMLPluralRule, string>>>;

const STR: Record<Lang, Dict> = {
  ru: {
    brand: 'Вершина России',
    'doc.title': 'Вершина России · Эльбрус 3D',
    'unit.m': '{v} м',
    'unit.km': '{v} км',
    num: '№ {n}',
    'lang.label': 'Язык',
    loading: 'Загружаем Эльбрус…',
    'loadError': 'Не удалось загрузить 3D-модель.',
    northUp: 'Север вверх',
    allPlaces: 'Все места и маршруты',
    resetView: 'Исходный вид',
    data: '© Данные',
    'hint.touch': 'Вращайте пальцем · двумя пальцами — сдвиг и масштаб',
    'hint.mouse': 'Тяните — вращение · правая кнопка — сдвиг · колесо — масштаб',
    'readout.camera': 'Камера {alt} · {dist} до цели',

    mode: 'Режим',
    'mode.climb': 'Подъём',
    'mode.overview': 'Вся гора',
    'look.digital': 'Цифровой',
    'look.satellite': 'Спутник',
    station: 'Станция',
    stationN: 'Станция {n}',
    up: 'Выше',
    'up.aria': 'Выше, к следующей станции',
    down: 'Ниже',
    'down.aria': 'Ниже, к предыдущей станции',
    'strip.aria': 'Маршрут: профиль высоты и все станции',
    fromAzau: '{km} от Азау',
    walk: '≈ {t} пешком',
    'time.hm': '{h} ч {m} мин',
    'time.m': '{m} мин',
    'place.at': 'Место: {name}',
    'place.between': 'Участок {from} → {to}',
    summit: 'вершина',
    'state.open': 'История открыта',
    'state.last': 'Открыта последней',
    'state.next': 'Открывается следующей',
    'state.closed': 'Закрыта',
    'closed.title': 'Эта станция пока закрыта',
    'next.teaser': 'Откроется через {time}. Следующая история на пути к вершине.',
    'closed.teaser': 'Откроется {date}. {ahead}.',
    'cta.read': 'Читать историю',
    'cta.remind': 'Напомнить об открытии',

    back: 'Назад к горе',
    'nav.stories': 'Истории',
    here: 'Вы здесь',
    'grid.aria': 'Гора из 250 историй',
    remindSoon: 'Скоро: напоминания',
    openedOn: 'Открыта {date}',
    lastOpenedOn: 'Открыта последней {date}',
    share: 'Поделиться',
    copyLink: 'Скопировать ссылку',
    copied: 'Ссылка скопирована',
    copyFailed: 'Не удалось скопировать',
    'next.lead': 'Это следующая история на пути к вершине. Она откроется совсем скоро.',
    'closed.lead': 'Откроется {date} в {time}. {ahead}.',
    prevStory: 'Предыдущая история, № {n}',
    nextStory: 'Следующая история, № {n}',
    storyN: 'история № {n}',
    nextStation: 'Следующая станция, № {n}',
    storyCell: 'История {n}',
    shareTitle: 'Вершина России · история № {n}',
    'ph.title': '[ЗАГОЛОВОК ИСТОРИИ]',
    'ph.teaser': '[Одна-две строки анонса истории: кто, когда, что произошло на Эльбрусе.]',
    'ph.date': '[ДАТА]',
    'ph.time': '[ВРЕМЯ]',
    'ph.rubric': '[РУБРИКА]',
    'ph.media': '[ФОТО ИЛИ ВИДЕО ИСТОРИИ]',
    'ph.lead': '[Лид: о чём эта история в двух предложениях.]',
    'ph.body': '[Основной текст истории. Достижение, человек, дата, высота, обстоятельства. Объём — на один экран чтения, чтобы историю хотелось дочитать и переслать.]',

    details: 'Подробности',
    toggleSheet: 'Развернуть или свернуть',
    allPlacesBack: 'Все места',
    close: 'Закрыть',
    elevation: 'Высота',
    coords: 'Координаты',
    show: 'Показать',
    routes: 'Маршруты',
    nearby: 'Рядом',
    route: 'Маршрут',
    length: 'Длина',
    onFoot: 'Пешком',
    ascentFoot: 'Набор пешком',
    highPoint: 'Высшая точка',
    profile: 'Профиль высоты',
    routeNote: 'Только для ориентира, не для навигации. Условия на Эльбрусе быстро меняются: уточняйте маршрут и погоду у гидов и спасателей.',
    stages: 'Этапы',
    range: '{a} → {b}',
    stops: 'Остановки',
    listTitle: 'Маршруты и места',
    other: 'Другое',
    'cat.summit': 'Вершина', 'cats.summit': 'Вершины',
    'cat.saddle': 'Седловина', 'cats.saddle': 'Седловины',
    'cat.hut': 'Приют', 'cats.hut': 'Приюты',
    'cat.lift': 'Станция канатной дороги', 'cats.lift': 'Станции канатных дорог',
    'cat.viewpoint': 'Смотровая точка', 'cats.viewpoint': 'Смотровые точки',
    'cat.village': 'Посёлок', 'cats.village': 'Посёлки',
    'cat.place': 'Место',

    'stn.azau': 'Азау', 'stn.krugosor': 'Кругозор', 'stn.mir': 'Мир', 'stn.garabashi': 'Гарабаши',
    'stn.priyut-11': 'Приют 11', 'stn.pastukhov-rocks': 'Скалы Пастухова', 'stn.saddle': 'Седловина',
    'stn.west-summit': 'Западная вершина', 'stn.north-hut': 'Северный приют',
    'stn.east-summit': 'Восточная вершина', 'stn.jily-su': 'Джилы-Су',
    'stnShort.pastukhov-rocks': 'Пастухова', 'stnShort.west-summit': 'Вершина', 'stnShort.east-summit': 'Вост. вершина',
  },

  en: {
    brand: 'Summit of Russia',
    'doc.title': 'Summit of Russia · Elbrus 3D',
    'unit.m': '{v} m',
    'unit.km': '{v} km',
    num: 'No. {n}',
    'lang.label': 'Language',
    loading: 'Loading Elbrus…',
    'loadError': 'Could not load the 3D model.',
    northUp: 'North up',
    allPlaces: 'All places and routes',
    resetView: 'Reset view',
    data: '© Data',
    'hint.touch': 'Drag to rotate · two fingers to pan and zoom',
    'hint.mouse': 'Drag to rotate · right button to pan · wheel to zoom',
    'readout.camera': 'Camera {alt} · {dist} to target',

    mode: 'Mode',
    'mode.climb': 'Climb',
    'mode.overview': 'Whole mountain',
    'look.digital': 'Digital',
    'look.satellite': 'Satellite',
    station: 'Station',
    stationN: 'Station {n}',
    up: 'Up',
    'up.aria': 'Up to the next station',
    down: 'Down',
    'down.aria': 'Down to the previous station',
    'strip.aria': 'Route: elevation profile and every station',
    fromAzau: '{km} from Azau',
    walk: '≈ {t} on foot',
    'time.hm': '{h} h {m} min',
    'time.m': '{m} min',
    'place.at': 'At {name}',
    'place.between': '{from} → {to}',
    summit: 'summit',
    'state.open': 'Story open',
    'state.last': 'Newest story',
    'state.next': 'Opens next',
    'state.closed': 'Closed',
    'closed.title': 'This station is still closed',
    'next.teaser': 'Opens in {time}. The next story on the way to the summit.',
    'closed.teaser': 'Opens on {date}. {ahead}.',
    'cta.read': 'Read the story',
    'cta.remind': 'Remind me when it opens',

    back: 'Back to the mountain',
    'nav.stories': 'Stories',
    here: 'You are here',
    'grid.aria': 'A mountain of 250 stories',
    remindSoon: 'Reminders coming soon',
    openedOn: 'Opened {date}',
    lastOpenedOn: 'Newest, opened {date}',
    share: 'Share',
    copyLink: 'Copy link',
    copied: 'Link copied',
    copyFailed: 'Could not copy',
    'next.lead': 'This is the next story on the way to the summit. It opens very soon.',
    'closed.lead': 'Opens on {date} at {time}. {ahead}.',
    prevStory: 'Previous story, No. {n}',
    nextStory: 'Next story, No. {n}',
    storyN: 'story No. {n}',
    nextStation: 'Next station: No. {n}',
    storyCell: 'Story {n}',
    shareTitle: 'Summit of Russia · story No. {n}',
    'ph.title': '[STORY TITLE]',
    'ph.teaser': '[One or two lines teasing the story: who, when, what happened on Elbrus.]',
    'ph.date': '[DATE]',
    'ph.time': '[TIME]',
    'ph.rubric': '[SECTION]',
    'ph.media': '[STORY PHOTO OR VIDEO]',
    'ph.lead': '[Lead: what this story is about, in two sentences.]',
    'ph.body': '[The story itself: the achievement, the person, the date, the altitude, the circumstances. One screen of reading, so people want to finish it and pass it on.]',

    details: 'Details',
    toggleSheet: 'Expand or collapse',
    allPlacesBack: 'All places',
    close: 'Close',
    elevation: 'Elevation',
    coords: 'Coordinates',
    show: 'Show',
    routes: 'Routes',
    nearby: 'Nearby',
    route: 'Route',
    length: 'Length',
    onFoot: 'On foot',
    ascentFoot: 'Climb on foot',
    highPoint: 'Highest point',
    profile: 'Elevation profile',
    routeNote: 'For orientation only, not for navigation. Conditions on Elbrus change fast: check the route and the weather with guides and rescuers.',
    stages: 'Stages',
    range: '{a} → {b}',
    stops: 'Stops',
    listTitle: 'Routes and places',
    other: 'Other',
    'cat.summit': 'Summit', 'cats.summit': 'Summits',
    'cat.saddle': 'Saddle', 'cats.saddle': 'Saddles',
    'cat.hut': 'Hut', 'cats.hut': 'Huts',
    'cat.lift': 'Cable car station', 'cats.lift': 'Cable car stations',
    'cat.viewpoint': 'Viewpoint', 'cats.viewpoint': 'Viewpoints',
    'cat.village': 'Village', 'cats.village': 'Villages',
    'cat.place': 'Place',

    'stn.azau': 'Azau', 'stn.krugosor': 'Krugozor', 'stn.mir': 'Mir', 'stn.garabashi': 'Garabashi',
    'stn.priyut-11': 'Priyut 11', 'stn.pastukhov-rocks': 'Pastukhov Rocks', 'stn.saddle': 'Saddle',
    'stn.west-summit': 'West Summit', 'stn.north-hut': 'North Hut',
    'stn.east-summit': 'East Summit', 'stn.jily-su': 'Jily-Su',
    'stnShort.pastukhov-rocks': 'Pastukhov', 'stnShort.west-summit': 'Summit',
  },

  zh: {
    brand: '俄罗斯之巅',
    'doc.title': '俄罗斯之巅 · 厄尔布鲁士 3D',
    'unit.m': '{v} 米',
    'unit.km': '{v} 公里',
    num: '{n} 号',
    'lang.label': '语言',
    loading: '正在加载厄尔布鲁士…',
    'loadError': '无法加载 3D 模型。',
    northUp: '北方朝上',
    allPlaces: '所有地点和路线',
    resetView: '初始视角',
    data: '© 数据',
    'hint.touch': '单指旋转 · 双指平移和缩放',
    'hint.mouse': '拖动旋转 · 右键平移 · 滚轮缩放',
    'readout.camera': '相机 {alt} · 距目标 {dist}',

    mode: '模式',
    'mode.climb': '攀登',
    'mode.overview': '全山',
    'look.digital': '数字',
    'look.satellite': '卫星',
    station: '站点',
    stationN: '第 {n} 站',
    up: '向上',
    'up.aria': '向上，前往下一站',
    down: '向下',
    'down.aria': '向下，返回上一站',
    'strip.aria': '路线：海拔剖面和所有站点',
    fromAzau: '距阿扎乌 {km}',
    walk: '步行约 {t}',
    'time.hm': '{h} 小时 {m} 分钟',
    'time.m': '{m} 分钟',
    'place.at': '位于{name}',
    'place.between': '{from} → {to} 路段',
    summit: '顶峰',
    'state.open': '故事已开放',
    'state.last': '最新开放',
    'state.next': '下一个开放',
    'state.closed': '尚未开放',
    'closed.title': '此站点尚未开放',
    'next.teaser': '{time}后开放。登顶路上的下一个故事。',
    'closed.teaser': '将于{date}开放。{ahead}。',
    'cta.read': '阅读故事',
    'cta.remind': '开放时提醒我',

    back: '返回山峰',
    'nav.stories': '故事',
    here: '你在这里',
    'grid.aria': '250 个故事之山',
    remindSoon: '提醒功能即将推出',
    openedOn: '{date}开放',
    lastOpenedOn: '最新，{date}开放',
    share: '分享',
    copyLink: '复制链接',
    copied: '链接已复制',
    copyFailed: '复制失败',
    'next.lead': '这是登顶路上的下一个故事，很快就会开放。',
    'closed.lead': '将于{date} {time}开放。{ahead}。',
    prevStory: '上一个故事，{n} 号',
    nextStory: '下一个故事，{n} 号',
    storyN: '{n} 号故事',
    nextStation: '下一站：{n} 号',
    storyCell: '故事 {n}',
    shareTitle: '俄罗斯之巅 · {n} 号故事',
    'ph.title': '[故事标题]',
    'ph.teaser': '[一两句故事预告：谁、何时、在厄尔布鲁士发生了什么。]',
    'ph.date': '[日期]',
    'ph.time': '[时间]',
    'ph.rubric': '[栏目]',
    'ph.media': '[故事照片或视频]',
    'ph.lead': '[导语：用两句话说明这个故事。]',
    'ph.body': '[故事正文：成就、人物、日期、海拔、经过。篇幅一屏，让人想读完并转发。]',

    details: '详情',
    toggleSheet: '展开或收起',
    allPlacesBack: '所有地点',
    close: '关闭',
    elevation: '海拔',
    coords: '坐标',
    show: '显示',
    routes: '路线',
    nearby: '附近',
    route: '路线',
    length: '长度',
    onFoot: '步行',
    ascentFoot: '步行爬升',
    highPoint: '最高点',
    profile: '海拔剖面',
    routeNote: '仅供参考，不可用于导航。厄尔布鲁士的天气和路况变化很快：请向向导和救援人员确认路线和天气。',
    stages: '路段',
    range: '{a} → {b}',
    stops: '停靠点',
    listTitle: '路线和地点',
    other: '其他',
    'cat.summit': '山峰', 'cats.summit': '山峰',
    'cat.saddle': '鞍部', 'cats.saddle': '鞍部',
    'cat.hut': '避难所', 'cats.hut': '避难所',
    'cat.lift': '缆车站', 'cats.lift': '缆车站',
    'cat.viewpoint': '观景点', 'cats.viewpoint': '观景点',
    'cat.village': '村镇', 'cats.village': '村镇',
    'cat.place': '地点',

    'stn.azau': '阿扎乌', 'stn.krugosor': '克鲁戈佐尔', 'stn.mir': '米尔', 'stn.garabashi': '加拉巴希',
    'stn.priyut-11': '11号避难所', 'stn.pastukhov-rocks': '帕斯图霍夫岩', 'stn.saddle': '鞍部',
    'stn.west-summit': '西峰', 'stn.north-hut': '北避难所',
    'stn.east-summit': '东峰', 'stn.jily-su': '吉雷苏',
    'stnShort.west-summit': '顶峰',
  },

  ar: {
    brand: 'قمة روسيا',
    'doc.title': 'قمة روسيا · إلبروس ثلاثي الأبعاد',
    'unit.m': '{v} م',
    'unit.km': '{v} كم',
    num: 'رقم {n}',
    'lang.label': 'اللغة',
    loading: 'جارٍ تحميل إلبروس…',
    'loadError': 'تعذّر تحميل النموذج ثلاثي الأبعاد.',
    northUp: 'الشمال للأعلى',
    allPlaces: 'كل الأماكن والمسارات',
    resetView: 'العرض الأصلي',
    data: '© البيانات',
    'hint.touch': 'اسحب بإصبع للتدوير · بإصبعين للتحريك والتكبير',
    'hint.mouse': 'اسحب للتدوير · الزر الأيمن للتحريك · العجلة للتكبير',
    'readout.camera': 'الكاميرا {alt} · {dist} حتى الهدف',

    mode: 'الوضع',
    'mode.climb': 'الصعود',
    'mode.overview': 'الجبل كاملًا',
    'look.digital': 'رقمي',
    'look.satellite': 'قمر صناعي',
    station: 'المحطة',
    stationN: 'المحطة {n}',
    up: 'أعلى',
    'up.aria': 'للأعلى، إلى المحطة التالية',
    down: 'أسفل',
    'down.aria': 'للأسفل، إلى المحطة السابقة',
    'strip.aria': 'المسار: مقطع الارتفاع وكل المحطات',
    fromAzau: '{km} من آزاو',
    walk: '≈ {t} سيرًا',
    'time.hm': '{h} س {m} د',
    'time.m': '{m} د',
    'place.at': 'عند {name}',
    'place.between': 'من {from} إلى {to}',
    summit: 'القمة',
    'state.open': 'القصة متاحة',
    'state.last': 'أحدث قصة',
    'state.next': 'تُفتح تاليًا',
    'state.closed': 'مغلقة',
    'closed.title': 'هذه المحطة لم تُفتح بعد',
    'next.teaser': 'تُفتح بعد {time}. القصة التالية في الطريق إلى القمة.',
    'closed.teaser': 'تُفتح في {date}. {ahead}.',
    'cta.read': 'اقرأ القصة',
    'cta.remind': 'ذكّرني عند الافتتاح',

    back: 'العودة إلى الجبل',
    'nav.stories': 'القصص',
    here: 'أنت هنا',
    'grid.aria': 'جبل من 250 قصة',
    remindSoon: 'التذكيرات قريبًا',
    openedOn: 'فُتحت في {date}',
    lastOpenedOn: 'الأحدث، فُتحت في {date}',
    share: 'مشاركة',
    copyLink: 'نسخ الرابط',
    copied: 'تم نسخ الرابط',
    copyFailed: 'تعذّر النسخ',
    'next.lead': 'هذه هي القصة التالية في الطريق إلى القمة، وستُفتح قريبًا جدًا.',
    'closed.lead': 'تُفتح في {date} الساعة {time}. {ahead}.',
    prevStory: 'القصة السابقة، رقم {n}',
    nextStory: 'القصة التالية، رقم {n}',
    storyN: 'القصة رقم {n}',
    nextStation: 'المحطة التالية: رقم {n}',
    storyCell: 'القصة {n}',
    shareTitle: 'قمة روسيا · القصة رقم {n}',
    'ph.title': '[عنوان القصة]',
    'ph.teaser': '[سطر أو سطران للتعريف بالقصة: من، ومتى، وماذا حدث على إلبروس.]',
    'ph.date': '[التاريخ]',
    'ph.time': '[الوقت]',
    'ph.rubric': '[القسم]',
    'ph.media': '[صورة أو فيديو القصة]',
    'ph.lead': '[المقدمة: عمّ تتحدث هذه القصة في جملتين.]',
    'ph.body': '[نص القصة: الإنجاز، والشخص، والتاريخ، والارتفاع، والظروف. شاشة قراءة واحدة، ليرغب القارئ في إكمالها ومشاركتها.]',

    details: 'التفاصيل',
    toggleSheet: 'توسيع أو طي',
    allPlacesBack: 'كل الأماكن',
    close: 'إغلاق',
    elevation: 'الارتفاع',
    coords: 'الإحداثيات',
    show: 'عرض',
    routes: 'المسارات',
    nearby: 'بالقرب',
    route: 'مسار',
    length: 'الطول',
    onFoot: 'سيرًا',
    ascentFoot: 'الصعود سيرًا',
    highPoint: 'أعلى نقطة',
    profile: 'مقطع الارتفاع',
    routeNote: 'للاسترشاد فقط، وليس للملاحة. تتغير الظروف على إلبروس بسرعة: تحقّق من المسار والطقس مع المرشدين وفرق الإنقاذ.',
    stages: 'المراحل',
    range: 'من {a} إلى {b}',
    stops: 'نقاط التوقف',
    listTitle: 'المسارات والأماكن',
    other: 'أخرى',
    'cat.summit': 'قمة', 'cats.summit': 'القمم',
    'cat.saddle': 'سرج', 'cats.saddle': 'السروج',
    'cat.hut': 'ملجأ', 'cats.hut': 'الملاجئ',
    'cat.lift': 'محطة تلفريك', 'cats.lift': 'محطات التلفريك',
    'cat.viewpoint': 'نقطة مشاهدة', 'cats.viewpoint': 'نقاط المشاهدة',
    'cat.village': 'قرية', 'cats.village': 'القرى',
    'cat.place': 'مكان',

    'stn.azau': 'آزاو', 'stn.krugosor': 'كروغوزور', 'stn.mir': 'مير', 'stn.garabashi': 'غاراباشي',
    'stn.priyut-11': 'ملجأ 11', 'stn.pastukhov-rocks': 'صخور باستوخوف', 'stn.saddle': 'السرج',
    'stn.west-summit': 'القمة الغربية', 'stn.north-hut': 'الملجأ الشمالي',
    'stn.east-summit': 'القمة الشرقية', 'stn.jily-su': 'جيلي سو',
    'stnShort.pastukhov-rocks': 'باستوخوف', 'stnShort.west-summit': 'القمة',
  },
};

const PLURAL: Record<Lang, PluralDict> = {
  ru: { ahead: { one: 'До неё ещё {n} история', few: 'До неё ещё {n} истории', many: 'До неё ещё {n} историй', other: 'До неё ещё {n} истории' } },
  en: { ahead: { one: '{n} more story before it', other: '{n} more stories before it' } },
  zh: { ahead: { other: '前面还有 {n} 个故事' } },
  ar: { ahead: { other: 'عدد القصص قبلها: {n}' } },
};

// --- state ------------------------------------------------------------------------------

const STORE_KEY = 'elbrus.lang';
let current: Lang = detect();
const listeners = new Set<(lang: Lang) => void>();

function isLang(v: unknown): v is Lang {
  return LANGS.some((l) => l.id === v);
}

function detect(): Lang {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (isLang(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* storage blocked: fall through */
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

export const lang = (): Lang => current;
export const langInfo = (l: Lang = current) => LANGS.find((x) => x.id === l)!;

/** Switch language: updates <html lang/dir>, the URL's ?lang=, the saved choice, and every subscriber. */
export function setLang(next: Lang): void {
  if (!isLang(next)) return;
  current = next;
  try {
    localStorage.setItem(STORE_KEY, next);
  } catch {
    /* not saved: still works for this visit */
  }
  const url = new URL(location.href);
  url.searchParams.set('lang', next);
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  applyDocument();
  applyI18n(document.body);
  listeners.forEach((fn) => fn(next));
}

/** Call fn now and on every language change. */
export function onLang(fn: (lang: Lang) => void, now = false): void {
  listeners.add(fn);
  if (now) fn(current);
}

export function applyDocument(): void {
  const info = langInfo();
  document.documentElement.lang = info.id;
  document.documentElement.dir = info.dir;
  document.title = t('doc.title');
  // Arabic needs its own font; load it only when Arabic is chosen.
  if (info.id === 'ar' && !document.getElementById('font-ar')) {
    const link = Object.assign(document.createElement('link'), {
      id: 'font-ar',
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;800&display=swap',
    });
    document.head.appendChild(link);
  }
}

// --- lookup -----------------------------------------------------------------------------

const fill = (s: string, p?: Record<string, string | number>) =>
  p ? s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m)) : s;

/** Add strings from another module (e.g. the tour), per language. */
export function addStrings(more: Partial<Record<Lang, Dict>>): void {
  for (const l of Object.keys(more) as Lang[]) Object.assign(STR[l], more[l]);
}

export function t(key: string, params?: Record<string, string | number>): string {
  return fill(STR[current][key] ?? STR.en[key] ?? STR.ru[key] ?? key, params);
}

export function plural(key: string, n: number): string {
  const forms = PLURAL[current][key] ?? PLURAL.en[key] ?? {};
  const rule = new Intl.PluralRules(langInfo().locale).select(n);
  return fill(forms[rule] ?? forms.other ?? key, { n: num(n) });
}

/** Fill data-i18n / data-i18n-aria / data-i18n-title under root. */
export function applyI18n(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n!)));
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nAria!)));
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle!)));
}

// --- formatting -------------------------------------------------------------------------

const nfCache = new Map<string, Intl.NumberFormat>();
function nfmt(digits: number): Intl.NumberFormat {
  const k = `${current}|${digits}`;
  let f = nfCache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(langInfo().locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    nfCache.set(k, f);
  }
  return f;
}

/** A number in the current locale (grouping, decimal mark). */
export const num = (n: number, digits = 0) => nfmt(digits).format(digits ? n : Math.round(n));
/** Metres, e.g. "3 516 м" / "3,516 m". */
export const metres = (n: number) => t('unit.m', { v: num(n) });
/** Kilometres with one decimal (no decimal from 10 km when `adaptive`). */
export const km = (m: number, adaptive = false) => t('unit.km', { v: num(m / 1000, adaptive && m >= 10000 ? 0 : 1) });
/** Metres below 1 km, else kilometres. */
export const distance = (m: number) => (m < 1000 ? metres(m) : km(m, true));
/** "2 h 58 min". */
export function duration(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? t('time.hm', { h: num(h), m: num(m) }) : t('time.m', { m: num(m) });
}
export const dateLong = (iso: string) =>
  new Date(iso).toLocaleDateString(langInfo().locale, { day: 'numeric', month: 'long', year: 'numeric' });

/** Name of a stop along the climb (Azau, Garabashi…); `short` for the route strip. */
export const stationName = (id: string, short = false) =>
  (short ? STR[current][`stnShort.${id}`] : undefined) ?? STR[current][`stn.${id}`] ?? STR.en[`stn.${id}`] ?? id;

// --- content ----------------------------------------------------------------------------

export type Localized = Partial<Record<Lang, string>>;

/** Pick the current language from content: a plain string, or { ru, en, zh, ar } with fallbacks. */
export function loc(v: string | Localized | undefined, fallback = ''): string {
  if (v == null) return fallback;
  if (typeof v === 'string') return v;
  return v[current] ?? v.en ?? v.ru ?? Object.values(v)[0] ?? fallback;
}

/** Is this content field present in the current language (not a fallback)? */
export const hasLang = (v: string | Localized | undefined) => typeof v === 'object' && v != null && !!v[current];
