package jp.playstudy.apk;

import static org.junit.Assert.assertTrue;

import android.net.Uri;
import android.webkit.WebView;

import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public final class VideoSmokeTest {
    @Rule public ActivityScenarioRule<MainActivity> activityRule =
            new ActivityScenarioRule<>(MainActivity.class);

    @Test public void selectedVideoReachesPlayerMetadata() throws Exception {
        AtomicReference<WebView> web = new AtomicReference<>();
        activityRule.getScenario().onActivity(activity -> {
            try {
                File sample = new File(activity.getCacheDir(), "playstudy-smoke.mp4");
                try (InputStream source = activity.getAssets().open("test/sample.mp4");
                     FileOutputStream output = new FileOutputStream(sample)) {
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = source.read(buffer)) != -1) output.write(buffer, 0, count);
                }
                activity.getPreferences(0).edit()
                        .putString("media:smoke", Uri.fromFile(sample).toString()).commit();
                Field field = MainActivity.class.getDeclaredField("webView");
                field.setAccessible(true);
                web.set((WebView) field.get(activity));
            } catch (Exception error) {
                throw new RuntimeException(error);
            }
        });
        assertTrue("APK JavaScript bridge did not load", waitFor(web.get(),
                "typeof window.playStudyNativeFilesSelected === 'function'", "true", 20000));
        evaluate(web.get(), "window.playStudyNativeFilesSelected([{id:'smoke',name:'sample.mp4',type:'video/mp4'}],'')");
        assertTrue("Selected video did not load metadata: " + evaluate(web.get(),
                        "JSON.stringify({screen:state.screen,error:document.querySelector('#main-video')?.error?.code||0,ready:document.querySelector('#main-video')?.readyState||0,network:document.querySelector('#main-video')?.networkState||0,src:document.querySelector('#main-video')?.currentSrc||'',missing:activeV()?.missingSource||false})"),
                waitFor(web.get(), "document.querySelector('#main-video')?.readyState >= 1", "true", 30000));
    }

    private static boolean waitFor(WebView web, String expression, String expected, long timeoutMs)
            throws Exception {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (expected.equals(evaluate(web, expression))) return true;
            Thread.sleep(250);
        }
        return false;
    }

    private static String evaluate(WebView web, String expression) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                web.evaluateJavascript(expression, value -> { result.set(value); done.countDown(); }));
        assertTrue("WebView did not answer JavaScript", done.await(10, TimeUnit.SECONDS));
        return result.get();
    }
}
