import { describe, it, expect } from 'vitest';
import { GitHubClient } from '../../../src/v3/github/client';

describe('GitHubClient', () => {
  it('parses owner/repo from URL', () => {
    const client = new GitHubClient();
    expect(client.parseRepoUrl('https://github.com/facebook/react'))
      .toEqual({ owner: 'facebook', repo: 'react' });
    expect(client.parseRepoUrl('https://github.com/vercel/next.js/'))
      .toEqual({ owner: 'vercel', repo: 'next.js' });
    expect(client.parseRepoUrl('github.com/nodejs/node'))
      .toEqual({ owner: 'nodejs', repo: 'node' });
  });

  it('parses owner/repo shorthand', () => {
    const client = new GitHubClient();
    expect(client.parseRepoIdentifier('facebook/react'))
      .toEqual({ owner: 'facebook', repo: 'react' });
    expect(client.parseRepoIdentifier('https://github.com/vercel/next.js'))
      .toEqual({ owner: 'vercel', repo: 'next.js' });
  });

  it('returns null for invalid URL', () => {
    const client = new GitHubClient();
    expect(client.parseRepoUrl('not-a-url')).toBeNull();
    expect(client.parseRepoUrl('https://gitlab.com/foo/bar')).toBeNull();
  });

  it('creates instance with token', () => {
    const client = new GitHubClient('test-token');
    expect(client).toBeInstanceOf(GitHubClient);
  });
});
