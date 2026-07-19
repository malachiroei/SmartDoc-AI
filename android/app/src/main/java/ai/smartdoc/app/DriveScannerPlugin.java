package ai.smartdoc.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;

import java.io.InputStream;

/**
 * Opens Google Drive / Google ML Kit Document Scanner from the Capacitor WebView.
 *
 * - openDriveScanner(): launches Drive (user saves into SmartDoc_Inbox → pull ingest)
 * - scanDocument(): native Google scanner (same family as Drive Scan), returns PDF base64
 */
@CapacitorPlugin(name = "DriveScanner")
public class DriveScannerPlugin extends Plugin {

    private static final String DRIVE_PACKAGE = "com.google.android.apps.docs";

    @Nullable
    private static ActivityResultLauncher<IntentSenderRequest> scanLauncher;

    @Nullable
    private static DriveScannerPlugin instance;

    @Nullable
    private PluginCall pendingScanCall;

    static void setScanLauncher(ActivityResultLauncher<IntentSenderRequest> launcher) {
        scanLauncher = launcher;
    }

    static void handleScanActivityResult(ActivityResult result) {
        if (instance != null) {
            instance.onScanActivityResult(result);
        }
    }

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void isNativeAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("native", true);
        ret.put("driveInstalled", isPackageInstalled(DRIVE_PACKAGE));
        ret.put("mlKitReady", scanLauncher != null);
        call.resolve(ret);
    }

    /**
     * Best-effort open of Google Drive so the user can tap Scan and save
     * into the SmartDoc_Inbox folder (then SmartDoc pulls via Drive API).
     */
    @PluginMethod
    public void openDriveScanner(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }

        PackageManager pm = activity.getPackageManager();

        // Try a few Drive scan-related actions (OEM / Drive versions differ)
        String[] actions = new String[] {
            "com.google.android.apps.docs.SCAN",
            "com.google.android.apps.docs.DRIVE_OPEN_SCAN",
            "com.google.android.gms.mlkit.document.ACTION_SCAN_DOCUMENT"
        };

        for (String action : actions) {
            Intent scan = new Intent(action);
            scan.setPackage(DRIVE_PACKAGE);
            if (scan.resolveActivity(pm) != null) {
                try {
                    activity.startActivity(scan);
                    JSObject ret = new JSObject();
                    ret.put("mode", "drive_scan_intent");
                    ret.put("action", action);
                    call.resolve(ret);
                    return;
                } catch (ActivityNotFoundException ignored) {
                    // try next
                }
            }
        }

        Intent launch = pm.getLaunchIntentForPackage(DRIVE_PACKAGE);
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(launch);
            JSObject ret = new JSObject();
            ret.put("mode", "drive_app");
            ret.put(
                "message",
                "Opened Google Drive. Tap Scan and save the PDF into SmartDoc_Inbox."
            );
            call.resolve(ret);
            return;
        }

        try {
            Intent market = new Intent(
                Intent.ACTION_VIEW,
                Uri.parse("market://details?id=" + DRIVE_PACKAGE)
            );
            activity.startActivity(market);
            JSObject ret = new JSObject();
            ret.put("mode", "play_store");
            call.resolve(ret);
        } catch (ActivityNotFoundException e) {
            call.reject("Google Drive is not installed");
        }
    }

    /**
     * Launch Google ML Kit Document Scanner (native UI). Returns PDF as base64.
     */
    @PluginMethod
    public void scanDocument(PluginCall call) {
        if (scanLauncher == null) {
            call.reject("Scanner launcher not ready");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("No activity");
            return;
        }

        pendingScanCall = call;

        GmsDocumentScannerOptions options =
            new GmsDocumentScannerOptions.Builder()
                .setGalleryImportAllowed(true)
                .setPageLimit(8)
                .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
                .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
                .build();

        GmsDocumentScanning.getClient(options)
            .getStartScanIntent(activity)
            .addOnSuccessListener(
                intentSender -> {
                    IntentSenderRequest req =
                        new IntentSenderRequest.Builder(intentSender).build();
                    scanLauncher.launch(req);
                }
            )
            .addOnFailureListener(
                e -> {
                    pendingScanCall = null;
                    call.reject(
                        e.getMessage() != null
                            ? e.getMessage()
                            : "Failed to start document scanner"
                    );
                }
            );
    }

    private void onScanActivityResult(ActivityResult result) {
        PluginCall call = pendingScanCall;
        pendingScanCall = null;
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("Scan cancelled");
            return;
        }

        Intent data = result.getData();
        GmsDocumentScanningResult scanningResult =
            GmsDocumentScanningResult.fromActivityResultIntent(data);
        if (scanningResult == null || scanningResult.getPdf() == null) {
            call.reject("No PDF from scanner");
            return;
        }

        Uri pdfUri = scanningResult.getPdf().getUri();
        int pageCount = scanningResult.getPdf().getPageCount();

        try {
            InputStream in = getContext().getContentResolver().openInputStream(pdfUri);
            if (in == null) {
                call.reject("Could not read scanned PDF");
                return;
            }
            byte[] bytes = in.readAllBytes();
            in.close();

            JSObject ret = new JSObject();
            ret.put("mimeType", "application/pdf");
            ret.put("pageCount", pageCount);
            ret.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
            ret.put("fileName", "scan-" + System.currentTimeMillis() + ".pdf");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Read PDF failed");
        }
    }

    private boolean isPackageInstalled(String pkg) {
        try {
            getContext().getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }
}
