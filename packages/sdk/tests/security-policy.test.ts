import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('SECURITY.md Policy File', () => {
  const securityFilePath = path.join(__dirname, '../../..', 'SECURITY.md');

  it('should have SECURITY.md file in root directory', () => {
    expect(fs.existsSync(securityFilePath)).toBe(true);
  });

  it('should contain required security policy sections', () => {
    const content = fs.readFileSync(securityFilePath, 'utf-8');

    // Check for required sections
    expect(content).toMatch(/##\s+Supported Versions/i);
    expect(content).toMatch(/##\s+Reporting a Vulnerability/i);
    expect(content).toMatch(/##\s+Response Time/i);
    expect(content).toMatch(/##\s+Security Considerations/i);
  });

  it('should document supported versions policy', () => {
    const content = fs.readFileSync(securityFilePath, 'utf-8');
    expect(content).toMatch(/semver|semantic versioning|major\.minor\.patch/i);
  });

  it('should include vulnerability reporting instructions', () => {
    const content = fs.readFileSync(securityFilePath, 'utf-8');
    expect(content).toMatch(/email/i);
    expect(content).toMatch(/pgp|gpg|encryption/i);
  });

  it('should specify expected response times', () => {
    const content = fs.readFileSync(securityFilePath, 'utf-8');
    expect(content).toMatch(/48\s*h|response time/i);
    expect(content).toMatch(/90\s*d|fix|resolution/i);
  });

  it('should document known security considerations', () => {
    const content = fs.readFileSync(securityFilePath, 'utf-8');
    expect(content).toMatch(/security|consideration|limitation|risk/i);
  });

  it('should include responsible disclosure policy', () => {
    const content = fs.readFileSync(securityFilePath, 'utf-8');
    expect(content).toMatch(/responsible|disclosure|confidential/i);
  });
});
