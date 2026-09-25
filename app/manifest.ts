import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AGAFIT",
    short_name: "AGAFIT",
    description: "Mi plan de alimentación y bienestar",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF7F2",
    theme_color: "#FCE7F3",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
