package app.sonicdrifter;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;

/**
 * The whole app: a full-screen WebView running the same single-file game the
 * desktop plays, loaded from this APK's assets.
 *
 * Four things a bare WebView does not do, and the game needs:
 *
 *  - keep a run: DOM storage is off by default, and saved runs live there;
 *  - import a run: an input type=file does nothing unless somebody implements
 *    onShowFileChooser;
 *  - export a run: a blob download goes nowhere, so the page calls
 *    SonicDrifterAndroid.saveFile instead, which writes to Downloads;
 *  - not treat the pad's B as BACK: Android turns an unhandled gamepad B into
 *    the back key, and in this game B is a verb (the next cell).
 */
public class MainActivity extends Activity {
    private static final int PICK = 7;
    private WebView web;
    private ValueCallback<Uri[]> picking;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);          // android_asset is still readable
        s.setAllowContentAccess(false);
        web.setBackgroundColor(0xff05070e);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (picking != null) picking.onReceiveValue(null);
                picking = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(pick, "Open a run"), PICK);
                    return true;
                } catch (Exception e) {
                    picking = null;
                    return false;
                }
            }
        });
        web.addJavascriptInterface(new Bridge(), "SonicDrifterAndroid");
        setContentView(web);
        web.requestFocus();
        immersive();
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK && picking != null) {
            picking.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            picking = null;
        }
    }

    /** The system back gesture pauses a run; anywhere else it leaves. */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.drifter && window.drifter.back()) ? 1 : 0",
            new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String handled) {
                    if (!"1".equals(handled)) finish();
                }
            });
    }

    /**
     * Gamepad buttons go to the page and stop there. Left alone, Android turns
     * a B nobody consumed into BACK, and the game would pause every time the
     * rack was stepped.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int src = e.getSource();
        boolean pad = (src & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD
            || (src & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK;
        if (pad && KeyEvent.isGamepadButton(e.getKeyCode())) {
            web.dispatchKeyEvent(e);
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    /** Keep the run when the app goes to the background, then let the page rest. */
    @Override
    protected void onPause() {
        super.onPause();
        web.evaluateJavascript("window.drifter && window.drifter.save()", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String ignored) {
                if (!hasWindowFocus()) web.onPause();
            }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        immersive();
    }

    @Override
    public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) immersive();
    }

    @SuppressWarnings("deprecation")
    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    /** What the page can ask of the app. One thing: put a file where a person can find it. */
    final class Bridge {
        @JavascriptInterface
        public String saveFile(String name, String text) {
            String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
            byte[] bytes = text.getBytes(Charset.forName("UTF-8"));
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    // Written as the values of MediaStore.MediaColumns.RELATIVE_PATH and
                    // MediaStore.Downloads.EXTERNAL_CONTENT_URI, both API 29, so this
                    // compiles against the oldest platform jar the build can find.
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, safe);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                    v.put("relative_path", Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(Uri.parse("content://media/external/downloads"), v);
                    if (uri == null) return "THE PHONE WOULD NOT CREATE THE FILE";
                    OutputStream out = getContentResolver().openOutputStream(uri);
                    if (out == null) return "THE PHONE WOULD NOT OPEN THE FILE";
                    try {
                        out.write(bytes);
                    } finally {
                        out.close();
                    }
                    return "SAVED TO DOWNLOADS: " + safe;
                }
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) return "NO STORAGE AVAILABLE";
                File f = new File(dir, safe);
                FileOutputStream out = new FileOutputStream(f);
                try {
                    out.write(bytes);
                } finally {
                    out.close();
                }
                return "SAVED TO " + f.getAbsolutePath();
            } catch (Exception e) {
                return "COULD NOT SAVE: " + e.getMessage();
            }
        }
    }
}
