import { preview } from 'vite';

const configuredPort = process.env.PORT ? Number(process.env.PORT) : 4173;
if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535) {
  throw new Error('PORT must be a valid TCP port.');
}

const server = await preview({
  preview: {
    host: '0.0.0.0',
    port: configuredPort,
    strictPort: true,
  },
});

server.printUrls();
