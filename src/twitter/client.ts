import { TwitterApi } from 'twitter-api-v2';
import { config } from '../config';

export function createTwitterClient(): TwitterApi {
  return new TwitterApi({
    appKey: config.twitter.consumerKey,
    appSecret: config.twitter.consumerSecret,
    accessToken: config.twitter.accessToken,
    accessSecret: config.twitter.accessSecret,
  });
}

export function createBearerClient(): TwitterApi {
  return new TwitterApi(config.twitter.bearerToken);
}
