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
import java.net.HttpURLConnection;
import java.net.URL;
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
                try (InputStream source = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("frame-test.mp4");
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
        String mediaUrl = evaluate(web.get(), "window.PlayStudyNative.mediaUrl('smoke')");
        HttpURLConnection connection = (HttpURLConnection) new URL(mediaUrl.substring(1, mediaUrl.length() - 1)).openConnection();
        connection.setRequestProperty("Range", "bytes=0-1023");
        assertTrue("Local media server did not return a byte range: " + connection.getResponseCode(),
                connection.getResponseCode() == 206);
        try (InputStream media = connection.getInputStream()) {
            assertTrue("Local media server returned no data", media.read() >= 0);
        } finally { connection.disconnect(); }
        assertTrue("Selected video did not load metadata: " + evaluate(web.get(),
                        "JSON.stringify({screen:state.screen,error:document.querySelector('#main-video')?.error?.code||0,ready:document.querySelector('#main-video')?.readyState||0,network:document.querySelector('#main-video')?.networkState||0,src:document.querySelector('#main-video')?.currentSrc||'',missing:activeV()?.missingSource||false})"),
                waitFor(web.get(), "document.querySelector('#main-video')?.readyState >= 1", "true", 30000));
        if ("false".equals(evaluate(web.get(),"!!window.PlayStudyNative.adjacentFrame"))) {
            evaluate(web.get(),"window.baselineReport='running'; (" + BASELINE_CHECK + ")().then(r=>baselineReport=JSON.stringify(r),e=>baselineReport='ERROR '+e)");
            assertTrue("Baseline timed out",waitFor(web.get(),"baselineReport!=='running'","true",30000));
            String report=evaluate(web.get(),"baselineReport");
            android.util.Log.i("FrameAudit",report);
            assertTrue("Baseline measurement failed: "+report,report.contains("holdFromPlayback"));
            return;
        }
        assertTrue("Frame index did not become available", waitFor(web.get(),
                "window.PlayStudyNative.adjacentFrame('smoke',1,1,2)>1", "true", 15000));
        evaluate(web.get(), "window.frameReport='running'; (" + FRAME_CHECK + ")().then(()=>frameReport='pass',e=>frameReport=String(e))");
        assertTrue("Frame test timed out", waitFor(web.get(), "frameReport!=='running'", "true", 90000));
        org.junit.Assert.assertEquals("WebView frame stepping", "\"pass\"", evaluate(web.get(),"frameReport"));
    }

    private static final String BASELINE_CHECK = """
        async function(){
          const v=document.querySelector('#main-video'),b=document.querySelector('[data-focus-frame="1"]');
          const sleep=ms=>new Promise(r=>setTimeout(r,ms)), result={};
          let frames=[],alive=true;
          function observe(_,m){frames.push(m.mediaTime);if(alive)v.requestVideoFrameCallback(observe)}
          v.requestVideoFrameCallback(observe);
          v.currentTime=.45;await sleep(250);await v.play();await sleep(80);frames=[];
          b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,isPrimary:true}));
          await sleep(960);
          window.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));
          b.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true}));
          result.holdFromPlayback=frames.slice();
          result.heldEnd=v.currentTime;
          b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:2,isPrimary:true}));
          window.dispatchEvent(new PointerEvent('pointerup',{pointerId:2}));
          b.dispatchEvent(new MouseEvent('click',{detail:1,bubbles:true}));
          result.immediateTap=v.currentTime;
          await sleep(500);frames=[];
          for(let i=0;i<12;i++){b.click();await sleep(85)}
          result.forwardTaps=frames;alive=false;
          return result;
        }
        """;

    private static final String FRAME_CHECK = """
        async function(){
          const v=document.querySelector('#main-video'), sleep=ms=>new Promise(r=>setTimeout(r,ms));
          const btn=d=>document.querySelector('[data-focus-frame="'+d+'"]');
          const settle=async()=>{for(let n=0;v.seeking && n<100;n++)await sleep(20);await sleep(75)};
          v.pause();v.currentTime=0.98;await settle();
          const layer=()=>document.querySelector('.native-frame-preview');
          const canvas=document.createElement('canvas');canvas.width=64;canvas.height=36;
          const ctx=canvas.getContext('2d',{willReadFrequently:true});
          const pixels=image=>{ctx.drawImage(image,0,0,64,36);return canvas.toDataURL()};
          const signatures=[], seen=[];
          let watching=true,previous=null;
          function observe(){
            const visible=layer();
            if(visible!==previous){
              seen.push(visible?pixels(visible):'missing');
              previous=visible;
            }
            if(watching)requestAnimationFrame(observe);
          }
          requestAnimationFrame(observe);
          async function waitFrame(expected){
            for(let n=0;n<150;n++){
              if(layer() && Math.abs(v.currentTime-expected)<.002 && !v.seeking)return;
              await sleep(20);
            }
            throw Error('Frame missing at '+expected+' actual '+v.currentTime);
          }
          for(let i=0;i<16;i++){
            btn(1).click();
            const expected=1+(i+.5)/60;
            await waitFrame(expected);
            const reference=new Image();
            reference.src='/frame-preview/smoke?at='+expected;
            await reference.decode();
            const signature=pixels(reference);
            signatures.push(signature);
            if(pixels(layer())!==signature)throw Error('Wrong visible image at step '+i);
            await sleep(50);
          }
          watching=false;
          if(new Set(signatures).size<8 || seen.length<8)throw Error('Insufficient distinct visible frames');
          let pos=-1;
          for(const signature of seen){
            pos=signatures.indexOf(signature,pos+1);
            if(pos<0)throw Error('An older or missing image became visible');
          }
          for(let i=0;i<6;i++){
            btn(-1).click();await waitFrame(1+(14.5-i)/60);
            if(pixels(layer())!==signatures[14-i])throw Error('Wrong backward image '+i);
          }
          let burstActive=true,burstError='',lastIndex=9;
          function watchBurst(){
            const index=layer()?signatures.indexOf(pixels(layer()),lastIndex):-1;
            if(index<lastIndex)burstError='Reversal during rapid taps from '+lastIndex+' to '+index;
            else lastIndex=index;
            if(burstActive)requestAnimationFrame(watchBurst);
          }
          watchBurst();
          for(let i=0;i<6;i++){btn(1).click();await sleep(8)}
          await waitFrame(1+15.5/60);await sleep(100);burstActive=false;
          if(burstError || pixels(layer())!==signatures[15])throw Error(burstError||'Wrong final image after burst');
          const b=btn(1),press=()=>b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,isPrimary:true})),
            lift=()=>{window.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));b.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}))};
          press();await sleep(850);lift();await sleep(200);await settle();
          const released=v.currentTime;press();lift();await waitFrame(released+1/60);
        }
        """;

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
