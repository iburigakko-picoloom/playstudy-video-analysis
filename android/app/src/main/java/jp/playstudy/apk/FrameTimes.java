package jp.playstudy.apk;

import android.content.Context;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import java.io.IOException;
import java.util.Arrays;
import java.util.function.BooleanSupplier;

/** Presentation timestamps of the selected video track, including reordered frames. */
final class FrameTimes {
    final String id;
    final long[] pts;
    FrameTimes(String id, long[] pts) { this.id = id; this.pts = pts; }

    static FrameTimes read(Context context, String id, Uri uri, BooleanSupplier cancelled) throws IOException {
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(context, uri, null);
            int track = 0;
            while (track < extractor.getTrackCount()) {
                String mime = extractor.getTrackFormat(track).getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("video/")) break;
                track++;
            }
            if (track == extractor.getTrackCount()) throw new IOException("Missing video track");
            extractor.selectTrack(track);
            long[] times = new long[4096];
            int size = 0;
            do {
                if (cancelled.getAsBoolean()) throw new IOException("Cancelled");
                long time = extractor.getSampleTime();
                if (time < 0) break;
                if (size == times.length) {
                    if (size >= 2097152) throw new IOException("Frame index too large");
                    times = Arrays.copyOf(times, size * 2);
                }
                times[size++] = time;
            } while (extractor.advance());
            Arrays.sort(times, 0, size);
            int unique = 0;
            for (int i = 0; i < size; i++)
                if (unique == 0 || times[i] != times[unique - 1]) times[unique++] = times[i];
            return new FrameTimes(id, Arrays.copyOf(times, unique));
        } finally { extractor.release(); }
    }

    double step(double seconds, int direction, double duration) {
        int pos = Arrays.binarySearch(pts, Math.round(seconds * 1e6));
        if (pos < 0) pos = Math.max(0, -pos - 2);
        int next = Math.max(0, Math.min(pts.length - 1, pos + direction));
        if (next == pos) return seconds;
        double end = next + 1 < pts.length ? pts[next + 1] : duration * 1e6;
        // Aim inside the frame. Seeking exactly to a rounded boundary can show its predecessor.
        return (pts[next] + Math.max(0, end - pts[next]) / 2) / 1e6;
    }
}
