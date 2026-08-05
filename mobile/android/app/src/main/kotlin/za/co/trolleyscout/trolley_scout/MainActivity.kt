package za.co.trolleyscout.trolley_scout

import android.net.Uri
import android.os.Bundle
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.plugin.common.MethodChannel
import java.io.File

// FlutterFragmentActivity (not FlutterActivity) is required by local_auth so the
// biometric prompt can attach to a FragmentActivity.
class MainActivity : FlutterFragmentActivity() {
    private val receiptOcrChannel = "za.co.trolleyscout/receipt_ocr"

    override fun onCreate(savedInstanceState: Bundle?) {
        removeLegacyDiscoveryCaches()
        super.onCreate(savedInstanceState)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            receiptOcrChannel,
        ).setMethodCallHandler { call, result ->
            if (call.method != "recognizeText") {
                result.notImplemented()
                return@setMethodCallHandler
            }
            val path = call.argument<String>("path")?.trim().orEmpty()
            val file = File(path)
            if (path.isEmpty() || !file.isFile) {
                result.error("invalid_image", "The receipt image is unavailable.", null)
                return@setMethodCallHandler
            }
            val image = try {
                InputImage.fromFilePath(applicationContext, Uri.fromFile(file))
            } catch (_: Exception) {
                result.error("invalid_image", "The receipt image could not be opened.", null)
                return@setMethodCallHandler
            }
            val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
            recognizer.process(image)
                .addOnSuccessListener { text -> result.success(text.text) }
                .addOnFailureListener {
                    result.error("recognition_failed", "The receipt text could not be read.", null)
                }
                .addOnCompleteListener { recognizer.close() }
        }
    }

    // Discovery payloads used to be stored in FlutterSharedPreferences. Admin
    // accounts can receive enough catalogue data for the preferences platform
    // channel to exceed Android's heap while serialising every preference at
    // startup. Current builds keep this cache in a bounded file instead. Remove
    // only the obsolete cache keys before Flutter registers the preferences
    // plugin, preserving sessions and user settings during an upgrade.
    private fun removeLegacyDiscoveryCaches() {
        val preferences = getSharedPreferences("FlutterSharedPreferences", MODE_PRIVATE)
        val obsoleteKeys = preferences.all.keys.filter { key ->
            key.startsWith("flutter.discovery_cache_") ||
                key.startsWith("discovery_cache_")
        }
        if (obsoleteKeys.isEmpty()) return
        val editor = preferences.edit()
        obsoleteKeys.forEach(editor::remove)
        editor.commit()
    }
}
