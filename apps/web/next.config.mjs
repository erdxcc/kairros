/** @type {import('next').NextConfig} */
const nextConfig = {
    // @kairos/core ships raw TypeScript (exports point at ./src); let Next transpile it.
    transpilePackages: ['@kairos/core'],
    // Native/Node-only deps must not be bundled — they run on the nodejs runtime.
    serverExternalPackages: ['pg', '@electric-sql/pglite'],
    webpack: (config) => {
        // @kairos/core uses NodeNext-style `.js` import specifiers that actually
        // resolve to `.ts` source files. Teach webpack to try `.ts(x)` for `.js`.
        config.resolve.extensionAlias = {
            '.js': ['.ts', '.tsx', '.js'],
            ...config.resolve.extensionAlias,
        };
        return config;
    },
};

export default nextConfig;
