const path = require("path");
const { NormalModuleReplacementPlugin } = require("webpack");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  serverExternalPackages: [
    "@lucid-evolution/lucid",
    "@lucid-evolution/provider",
    "@lucid-evolution/utils",
    "@lucid-evolution/wallet",
    "@lucid-evolution/core-utils",
    "@lucid-evolution/core-types",
    "@lucid-evolution/sign_data",
    "@lucid-evolution/plutus",
    "@lucid-evolution/bip39",
    "@anastasia-labs/cardano-multiplatform-lib-nodejs",
    "charli3-js",
  ],
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      topLevelAwait: true,
      layers: true,
    };
    config.module.rules.push({
      test: /\.m?js$/,
      resolve: { fullySpecified: false },
    });
    config.plugins.push(
      new NormalModuleReplacementPlugin(
        /^\.\/libsodium-sumo\.mjs$/,
        path.resolve(
          __dirname,
          "node_modules/libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs",
        ),
      ),
    );
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        fs: false,
        net: false,
        tls: false,
        path: false,
        stream: false,
      };
    }
    return config;
  },
};
module.exports = nextConfig;
