import { logger } from '../logger';
import https from 'https';

/**
 * Extract image URL from a tweet's media attachments.
 * Requires the tweet to have been fetched with media expansions.
 */
export function getImageUrlFromTweet(tweet: any, includes?: any): string | undefined {
  // Check attachments.media_keys
  const mediaKeys = tweet.attachments?.media_keys;
  if (!mediaKeys || mediaKeys.length === 0) return undefined;

  // Find matching media in includes
  const media = includes?.media;
  if (!media) return undefined;

  for (const key of mediaKeys) {
    const m = media.find((item: any) => item.media_key === key);
    if (m && (m.type === 'photo' || m.type === 'animated_gif')) {
      return m.url || m.preview_image_url;
    }
  }

  return undefined;
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Download an image from a URL and return as Buffer.
 * Rejects if the image exceeds MAX_IMAGE_SIZE.
 */
export function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Only allow HTTPS URLs from Twitter's CDN
    if (!url.startsWith('https://pbs.twimg.com/')) {
      reject(new Error('Invalid image URL: only Twitter media URLs are accepted'));
      return;
    }

    https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadImage(res.headers.location).then(resolve).catch(reject);
        return;
      }

      let totalSize = 0;
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > MAX_IMAGE_SIZE) {
          res.destroy();
          reject(new Error(`Image too large (max ${MAX_IMAGE_SIZE / 1024 / 1024}MB)`));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Upload image buffer to Yosoku IPFS endpoint.
 * Returns the IPFS URI.
 */
export async function uploadImageToIpfs(imageBuffer: Buffer, contentType: string = 'image/jpeg'): Promise<string> {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="market-image.jpg"\r\nContent-Type: ${contentType}\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, imageBuffer, footer]);

    const options = {
      hostname: 'api.yosoku.fun',
      path: '/api/v1/upload-image',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const responseBody = Buffer.concat(chunks).toString();
        try {
          const json = JSON.parse(responseBody);
          const uri = json.gateway_url || json.ipfs_url || json.uri || json.url || json.ipfsUri || json.cid;
          if (uri) {
            logger.info('image_uploaded_to_ipfs', { uri });
            resolve(uri);
          } else {
            logger.error('image_upload_unexpected_response', { response: responseBody });
            reject(new Error(`Unexpected upload response: ${responseBody}`));
          }
        } catch {
          reject(new Error(`Failed to parse upload response: ${responseBody}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
