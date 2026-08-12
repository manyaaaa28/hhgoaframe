/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.public.blob.vercel-storage.com" }],
  },
  webpack: (config, { isServer }) => {
    // react-konva/konva pull in a Node "canvas" binding for their server-side
    // entry point. We only ever render Konva on the client, so stub it out
    // during the server compilation pass to avoid a native-module resolve error.
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
