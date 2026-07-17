import 'package:http/http.dart' as http;

http.Client createPlatformHttpClient() => http.Client();

const platformUsesBrowserCookies = false;
