import 'dart:convert';

String buildPayFastRedirectHtml(String actionUrl, Map<String, String> fields) {
  final inputs = fields.entries
      .map(
        (entry) => '<input type="hidden" name="${_escape(entry.key)}" '
            'value="${_escape(entry.value)}">',
      )
      .join();

  return '''<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${_styles()}</style></head>
<body><main><div class="mark">TS</div><h1>Opening PayFast…</h1>
<p>Your secure payment page is loading.</p>
<form id="payfast-form" method="post" action="${_escape(actionUrl)}">$inputs</form>
</main><script>document.getElementById("payfast-form").submit()</script></body></html>''';
}

String buildPayFastOnsiteHtml(String engineUrl, String onsiteUuid) {
  return '''<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${_styles()}</style></head>
<body><main><div class="mark">TS</div><h1>Opening PayFast…</h1>
<p>Your secure payment window is loading.</p></main>
<script src="${_escape(engineUrl)}"></script>
<script>
window.addEventListener("load", function () {
  if (!window.payfast_do_onsite_payment) {
    TrolleyScout.postMessage("error");
    return;
  }
  window.payfast_do_onsite_payment(
    { uuid: "${_escapeJavaScript(onsiteUuid)}" },
    function (completed) {
      TrolleyScout.postMessage(completed ? "completed" : "closed");
    }
  );
});
</script></body></html>''';
}

String _escape(String value) =>
    const HtmlEscape(HtmlEscapeMode.attribute).convert(value);

String _escapeJavaScript(String value) =>
    jsonEncode(value).substring(1, jsonEncode(value).length - 1);

String _styles() => '''
html,body{height:100%;margin:0}body{background:#f4eedd;color:#1c1710;font-family:Arial,sans-serif}
main{min-height:100%;display:grid;place-content:center;text-align:center;padding:24px;box-sizing:border-box}
.mark{width:64px;height:64px;margin:0 auto 16px;border-radius:14px;background:#0d6b3d;color:#f4eedd;
display:grid;place-content:center;font-weight:900;font-size:24px;border:3px solid #1c1710}
h1{margin:0 0 8px;font-size:24px}p{margin:0;color:#665c4f}
''';
