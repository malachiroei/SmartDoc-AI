package ai.smartdoc.app;

import android.os.Bundle;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private final ActivityResultLauncher<IntentSenderRequest> scanLauncher =
        registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            DriveScannerPlugin::handleScanActivityResult
        );

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DriveScannerPlugin.class);
        DriveScannerPlugin.setScanLauncher(scanLauncher);
        super.onCreate(savedInstanceState);
    }
}
