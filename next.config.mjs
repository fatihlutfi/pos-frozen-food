/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  compress: true,
  poweredByHeader: false,
  modularizeImports: {
    // lucide-react v1.x mengekspos setiap icon sebagai default export per file
    "lucide-react": {
      transform: "lucide-react/dist/esm/icons/{{kebabCase member}}",
    },
  },
};

export default nextConfig;
