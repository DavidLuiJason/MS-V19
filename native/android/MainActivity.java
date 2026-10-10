package app.marketscope.collector;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onPause() {
        super.onPause();
        keepWebViewActive();
    }

    @Override
    public void onStop() {
        super.onStop();
        keepWebViewActive();
    }

    private void keepWebViewActive() {
        try {
            if (getBridge() == null) return;
            WebView webView = getBridge().getWebView();
            if (webView == null) return;
            webView.resumeTimers();
            webView.dispatchWindowVisibilityChanged(View.VISIBLE);
        } catch (Exception ignored) {
        }
    }
}
