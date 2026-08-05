import 'api_models.dart';

const _day = Duration(days: 1);

enum RetailSeasonIcon { calendar, gift, graduation, travel, school, tag }

class RetailHoliday {
  const RetailHoliday({required this.date, required this.name, this.localName});

  final String date;
  final String name;
  final String? localName;

  factory RetailHoliday.fromJson(Map<String, dynamic> json) => RetailHoliday(
        date: json['date'] is String ? json['date'] as String : '',
        name: json['name'] is String ? json['name'] as String : '',
        localName:
            json['localName'] is String ? json['localName'] as String : null,
      );
}

class RetailSeason {
  const RetailSeason({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.timingLabel,
    required this.searchTerms,
    required this.icon,
    required this.status,
    this.startsOn,
    this.endsOn,
  });

  final String id;
  final String title;
  final String subtitle;
  final String timingLabel;
  final List<String> searchTerms;
  final RetailSeasonIcon icon;
  final String status;
  final String? startsOn;
  final String? endsOn;
}

const _southernSchoolMarkets = <String>{
  'AR',
  'AU',
  'BW',
  'CL',
  'LS',
  'MG',
  'MU',
  'MZ',
  'NA',
  'NZ',
  'SZ',
  'ZA',
  'ZM',
  'ZW',
};

const _blackFridayTerms = <String>[
  'black friday',
  'black week',
  'cyber monday',
  'cyber week',
  'black november',
];
const _christmasTerms = <String>[
  'christmas',
  'xmas',
  'festive',
  'secret santa',
  'stocking filler',
  'holiday gift',
];
const _easterTerms = <String>[
  'easter',
  'good friday',
  'hot cross bun',
  'hot cross buns',
  'easter egg',
  'easter eggs',
];
const _schoolTerms = <String>[
  'back to school',
  'school uniform',
  'school shoes',
  'school stationery',
  'stationery',
  'lunchbox',
  'lunch box',
  'backpack',
  'school bag',
  'notebook',
  'exercise book',
];
const _studentTerms = <String>[
  'student discount',
  'student deal',
  'student offer',
  'campus',
  'university',
  'varsity',
  'unidays',
  'student beans',
  'textbook',
  'study bundle',
];
const _travelTerms = <String>[
  'flight deal',
  'flight deals',
  'flight discount',
  'flight special',
  'flight specials',
  'cheap flight',
  'cheap flights',
  'airfare',
  'air ticket',
  'air tickets',
  'plane ticket',
  'holiday package',
  'holiday packages',
  'vacation package',
  'vacation packages',
  'travel deal',
  'travel deals',
  'travel special',
  'travel specials',
  'hotel deal',
  'hotel deals',
  'hotel special',
  'hotel specials',
  'hotel stay',
  'accommodation deal',
  'accommodation special',
  'night stay',
  'nights stay',
  'bed and breakfast',
  'bnb',
  'b b',
  'resort deal',
  'resort special',
  'booking discount',
  'booking com',
  'getaway',
  'getaways',
  'cruise deal',
  'car hire deal',
  'car rental deal',
];

List<RetailSeason> buildRetailSeasons(
  String countryCode, {
  DateTime? now,
  List<RetailHoliday> holidays = const [],
}) {
  final current = now ?? DateTime.now();
  final today = DateTime.utc(current.year, current.month, current.day);
  final moments = <RetailSeason?>[
    _blackFridayMoment(today),
    _christmasMoment(today),
    _easterMoment(today),
    _backToSchoolMoment(countryCode, today),
    ..._holidayMoments(today, holidays),
    _travelMoment(),
    _studentMoment(),
  ].whereType<RetailSeason>().toList();

  final seen = <String>{};
  final unique = moments.where((moment) => seen.add(_normalize(moment.title))).toList()
    ..sort((left, right) =>
        _seasonSortKey(left, today).compareTo(_seasonSortKey(right, today)));
  return unique.take(8).toList(growable: false);
}

bool matchesRetailSeason(Deal deal, RetailSeason season) {
  final searchable = _normalize([
    deal.title,
    deal.retailerName,
    deal.sourceLabel,
    deal.evidenceText,
    deal.savingText,
    deal.sourceUrl,
  ].whereType<String>().join(' '));
  return season.searchTerms
      .map(_normalize)
      .any((term) => _containsTerm(searchable, term));
}

int retailSeasonMatchCount(List<Deal> deals, RetailSeason season) =>
    deals.where((deal) => matchesRetailSeason(deal, season)).length;

RetailSeason? _blackFridayMoment(DateTime today) {
  var date = _fourthFriday(today.year, 11);
  var end = date.add(const Duration(days: 3));
  if (end.isBefore(today)) {
    date = _fourthFriday(today.year + 1, 11);
    end = date.add(const Duration(days: 3));
  }
  return _datedMoment(
    date: date,
    end: end,
    icon: RetailSeasonIcon.tag,
    id: 'black-friday-${date.year}',
    leadDays: 60,
    searchTerms: _blackFridayTerms,
    subtitle: 'Watch verified Black Friday and Cyber Monday prices before buying.',
    title: 'Black Friday watch',
    today: today,
  );
}

RetailSeason? _christmasMoment(DateTime today) {
  var date = DateTime.utc(today.year, 12, 25);
  var start = date.subtract(const Duration(days: 55));
  var end = DateTime.utc(today.year + 1, 1, 2);
  if (end.isBefore(today)) {
    date = DateTime.utc(today.year + 1, 12, 25);
    start = date.subtract(const Duration(days: 55));
    end = DateTime.utc(today.year + 2, 1, 2);
  }
  return _rangedMoment(
    start: start,
    end: end,
    icon: RetailSeasonIcon.gift,
    id: 'christmas-${date.year}',
    leadDays: 60,
    searchTerms: _christmasTerms,
    subtitle: 'Track festive food, gifts and home offers from live store sources.',
    title: 'Festive season',
    today: today,
  );
}

RetailSeason? _easterMoment(DateTime today) {
  var easter = _easterSunday(today.year);
  var start = easter.subtract(const Duration(days: 45));
  var end = easter.add(_day);
  if (end.isBefore(today)) {
    easter = _easterSunday(today.year + 1);
    start = easter.subtract(const Duration(days: 45));
    end = easter.add(_day);
  }
  return _rangedMoment(
    start: start,
    end: end,
    icon: RetailSeasonIcon.gift,
    id: 'easter-${easter.year}',
    leadDays: 60,
    searchTerms: _easterTerms,
    subtitle: 'Find verified Easter food and family offers as stores publish them.',
    title: 'Easter savings',
    today: today,
  );
}

RetailSeason? _backToSchoolMoment(String countryCode, DateTime today) {
  final southern = _southernSchoolMarkets.contains(countryCode.trim().toUpperCase());
  DateTime start;
  DateTime end;
  if (southern) {
    start = DateTime.utc(today.year - 1, 11, 15);
    end = DateTime.utc(today.year, 2, 15);
    if (end.isBefore(today)) {
      start = DateTime.utc(today.year, 11, 15);
      end = DateTime.utc(today.year + 1, 2, 15);
    }
  } else {
    start = DateTime.utc(today.year, 7, 15);
    end = DateTime.utc(today.year, 9, 30);
    if (end.isBefore(today)) {
      start = DateTime.utc(today.year + 1, 7, 15);
      end = DateTime.utc(today.year + 1, 9, 30);
    }
  }
  return _rangedMoment(
    start: start,
    end: end,
    icon: RetailSeasonIcon.school,
    id: 'back-to-school-${end.year}',
    leadDays: 60,
    searchTerms: _schoolTerms,
    subtitle: 'Compare uniforms, stationery, lunch gear and study essentials.',
    title: 'Back-to-school season',
    today: today,
  );
}

List<RetailSeason> _holidayMoments(
    DateTime today, List<RetailHoliday> holidays) {
  return holidays.expand((holiday) {
    final date = _parseIsoDate(holiday.date);
    if (date == null || date.isBefore(today) || date.difference(today).inDays > 45) {
      return const <RetailSeason>[];
    }
    final names = '${holiday.name} ${holiday.localName ?? ''}';
    if (RegExp(r'christmas|good friday|easter', caseSensitive: false)
        .hasMatch(names)) {
      return const <RetailSeason>[];
    }
    final moment = _datedMoment(
      date: date,
      end: date,
      icon: RetailSeasonIcon.calendar,
      id: 'holiday-${holiday.date}-${_normalize(holiday.name).replaceAll(' ', '-')}',
      leadDays: 45,
      searchTerms: [holiday.name, if (holiday.localName != null) holiday.localName!],
      subtitle: 'See live offers that stores have linked to this public holiday.',
      title: holiday.localName ?? holiday.name,
      today: today,
    );
    return moment == null ? const <RetailSeason>[] : [moment];
  }).take(2).toList(growable: false);
}

RetailSeason _studentMoment() => const RetailSeason(
      icon: RetailSeasonIcon.graduation,
      id: 'student-offers',
      searchTerms: _studentTerms,
      status: 'always',
      subtitle: 'Find verified student pricing for study, tech, data and campus life.',
      timingLabel: 'Available year-round',
      title: 'Student offers',
    );

RetailSeason _travelMoment() => const RetailSeason(
      icon: RetailSeasonIcon.travel,
      id: 'travel-deals',
      searchTerms: _travelTerms,
      status: 'always',
      subtitle:
          'Compare verified flights, stays, packages, resorts and local getaways.',
      timingLabel: 'Available now',
      title: 'Travel deals',
    );

RetailSeason? _datedMoment({
  required DateTime date,
  required DateTime end,
  required RetailSeasonIcon icon,
  required String id,
  required int leadDays,
  required List<String> searchTerms,
  required String subtitle,
  required String title,
  required DateTime today,
}) =>
    _rangedMoment(
      start: date,
      end: end,
      icon: icon,
      id: id,
      leadDays: leadDays,
      searchTerms: searchTerms,
      subtitle: subtitle,
      title: title,
      today: today,
    );

RetailSeason? _rangedMoment({
  required DateTime start,
  required DateTime end,
  required RetailSeasonIcon icon,
  required String id,
  required int leadDays,
  required List<String> searchTerms,
  required String subtitle,
  required String title,
  required DateTime today,
}) {
  final daysUntil = start.difference(today).inDays;
  final active = !today.isBefore(start) && !today.isAfter(end);
  if (!active && (daysUntil < 0 || daysUntil > leadDays)) return null;
  return RetailSeason(
    endsOn: _isoDate(end),
    icon: icon,
    id: id,
    searchTerms: searchTerms,
    startsOn: _isoDate(start),
    status: active ? 'active' : 'upcoming',
    subtitle: subtitle,
    timingLabel: active
        ? 'Happening now'
        : daysUntil == 1
            ? 'Starts tomorrow'
            : 'Starts in $daysUntil days',
    title: title,
  );
}

int _seasonSortKey(RetailSeason moment, DateTime today) {
  if (moment.status == 'active') return -2;
  if (moment.status == 'always') return 10000;
  final starts = moment.startsOn == null ? null : _parseIsoDate(moment.startsOn!);
  return starts?.difference(today).inDays ?? 9999;
}

DateTime _fourthFriday(int year, int month) {
  final first = DateTime.utc(year, month, 1);
  final firstFridayOffset = (DateTime.friday - first.weekday + 7) % 7;
  return DateTime.utc(year, month, 1 + firstFridayOffset + 21);
}

DateTime _easterSunday(int year) {
  final a = year % 19;
  final b = year ~/ 100;
  final c = year % 100;
  final d = b ~/ 4;
  final e = b % 4;
  final f = (b + 8) ~/ 25;
  final g = (b - f + 1) ~/ 3;
  final h = (19 * a + b - d - g + 15) % 30;
  final i = c ~/ 4;
  final k = c % 4;
  final l = (32 + 2 * e + 2 * i - h - k) % 7;
  final m = (a + 11 * h + 22 * l) ~/ 451;
  final month = (h + l - 7 * m + 114) ~/ 31;
  final day = ((h + l - 7 * m + 114) % 31) + 1;
  return DateTime.utc(year, month, day);
}

bool _containsTerm(String searchable, String term) {
  if (term.isEmpty) return false;
  return ' $searchable '.contains(' $term ');
}

String _normalize(String value) => value
    .toLowerCase()
    .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
    .trim();

DateTime? _parseIsoDate(String value) {
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(value);
  if (match == null) return null;
  return DateTime.utc(
    int.parse(match.group(1)!),
    int.parse(match.group(2)!),
    int.parse(match.group(3)!),
  );
}

String _isoDate(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-'
    '${date.month.toString().padLeft(2, '0')}-'
    '${date.day.toString().padLeft(2, '0')}';
