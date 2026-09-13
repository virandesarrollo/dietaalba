import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Alba's Lifestyle",
    short_name: "Alba Life",
    description: "Mi plan de alimentación y bienestar",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF7F2",
    theme_color: "#FCE7F3",
    icons: [
      {
        src: "/icon.png",
        sizes: "192x192 512x512",
        type: "image/png",
      },
    ],
  }
}

