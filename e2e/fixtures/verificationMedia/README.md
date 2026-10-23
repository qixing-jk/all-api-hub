# Verification media fixtures

Synthetic 320×192 white frames with a red square. No external content or API calls.

Reproduce with FFmpeg:

```sh
ffmpeg -f lavfi -i 'color=c=white:s=320x192:d=1:r=10' -vf 'drawbox=x=142:y=78:w=36:h=36:color=red:t=fill' -frames:v 1 image.png
ffmpeg -loop 1 -i image.png -t 1 -r 10 -c:v libvpx-vp9 -pix_fmt yuv420p -an video.webm
```

The browser workflow asserts image decoding and actual video playback, beyond URL rendering.
