package app.marketscope.collector;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(
    name = "MarketScopeNative",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class NativeBridgePlugin extends Plugin {

    private void launchService(PluginCall call) {
        String text = call.getString("text", "Collecting market data");
        try {
            Intent intent = new Intent(getContext(), CollectorService.class);
            intent.putExtra(CollectorService.EXTRA_TEXT, text);
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Service start failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void startService(PluginCall call) {
        launchService(call);
    }

    @PluginMethod
    public void updateService(PluginCall call) {
        launchService(call);
    }

    @PluginMethod
    public void stopService(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), CollectorService.class));
            call.resolve();
        } catch (Exception e) {
            call.reject("Service stop failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) {
            resolveGranted(call, NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
            return;
        }
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            resolveGranted(call, true);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        resolveGranted(call, getPermissionState("notifications") == PermissionState.GRANTED);
    }

    private void resolveGranted(PluginCall call, boolean granted) {
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void getBatteryStatus(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        boolean unrestricted = pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        JSObject result = new JSObject();
        result.put("unrestricted", unrestricted);
        call.resolve(result);
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                call.resolve();
            } catch (Exception e2) {
                call.reject("Could not open settings: " + e2.getMessage());
            }
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("serviceRunning", CollectorService.running);
        result.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(result);
    }

    // Copies a file from the app cache into the phone's public Downloads/MarketScope folder.
    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String path = call.getString("path");
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (path == null || filename == null) {
            call.reject("Missing path or filename");
            return;
        }
        if (Build.VERSION.SDK_INT < 29) {
            call.reject("NOT_SUPPORTED");
            return;
        }
        Uri target = null;
        ContentResolver resolver = getContext().getContentResolver();
        try {
            String cleanPath = path;
            if (cleanPath.startsWith("file://")) {
                cleanPath = Uri.parse(cleanPath).getPath();
            }
            File source = new File(cleanPath);
            if (!source.exists()) {
                call.reject("Source file not found");
                return;
            }

            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/MarketScope");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            target = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (target == null) {
                call.reject("Could not create the file in Downloads");
                return;
            }

            try (InputStream in = new FileInputStream(source); OutputStream out = resolver.openOutputStream(target)) {
                if (out == null) {
                    throw new IOException("Could not open the Downloads file");
                }
                byte[] buffer = new byte[65536];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                }
            }

            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(target, done, null, null);

            JSObject result = new JSObject();
            result.put("location", "Downloads/MarketScope/" + filename);
            call.resolve(result);
        } catch (Exception e) {
            if (target != null) {
                try {
                    resolver.delete(target, null, null);
                } catch (Exception ignored) {
                }
            }
            call.reject("Save failed: " + e.getMessage());
        }
    }
}
