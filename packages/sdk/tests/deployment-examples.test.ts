import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

interface DeploymentExample {
  name: string;
  description: string;
  architecture: string;
  integrationCode: string;
  performanceData: {
    before: number;
    after: number;
    improvement: string;
  };
  lessonsLearned: string[];
}

interface DeploymentExamples {
  examples: {
    [name: string]: DeploymentExample;
  };
}

describe('Real-world Deployment Examples', () => {
  const examplesPath = path.join(__dirname, '../../..', 'docs', 'DEPLOYMENT_EXAMPLES.json');

  it('should have deployment examples documentation', () => {
    expect(fs.existsSync(examplesPath)).toBe(true);
  });

  it('should include DEX aggregator example', () => {
    const content = JSON.parse(fs.readFileSync(examplesPath, 'utf-8')) as DeploymentExamples;

    expect(content.examples).toHaveProperty('dex_aggregator');
    const example = content.examples['dex_aggregator'];

    expect(example.name).toBe('DEX Aggregator');
    expect(example.description).toMatch(/cross-contract/i);
    expect(example.architecture).toBeDefined();
    expect(example.integrationCode).toBeDefined();
    expect(example.performanceData).toBeDefined();
    expect(example.lessonsLearned.length).toBeGreaterThan(0);
  });

  it('should include lending protocol example', () => {
    const content = JSON.parse(fs.readFileSync(examplesPath, 'utf-8')) as DeploymentExamples;

    expect(content.examples).toHaveProperty('lending_protocol');
    const example = content.examples['lending_protocol'];

    expect(example.name).toBe('Lending Protocol');
    expect(example.description).toMatch(/liquidation/i);
    expect(example.architecture).toBeDefined();
  });

  it('should include NFT marketplace example', () => {
    const content = JSON.parse(fs.readFileSync(examplesPath, 'utf-8')) as DeploymentExamples;

    expect(content.examples).toHaveProperty('nft_marketplace');
    const example = content.examples['nft_marketplace'];

    expect(example.name).toBe('NFT Marketplace');
    expect(example.description).toMatch(/batch/i);
  });

  it('should include bridge contract example', () => {
    const content = JSON.parse(fs.readFileSync(examplesPath, 'utf-8')) as DeploymentExamples;

    expect(content.examples).toHaveProperty('bridge_contract');
    const example = content.examples['bridge_contract'];

    expect(example.name).toBe('Bridge Contract');
    expect(example.description).toMatch(/validator/i);
  });

  it('should include yield aggregator example', () => {
    const content = JSON.parse(fs.readFileSync(examplesPath, 'utf-8')) as DeploymentExamples;

    expect(content.examples).toHaveProperty('yield_aggregator');
    const example = content.examples['yield_aggregator'];

    expect(example.name).toBe('Yield Aggregator');
    expect(example.description).toMatch(/strategy|composition/i);
  });

  it('should have architecture diagrams for each example', () => {
    const content = JSON.parse(fs.readFileSync(examplesPath, 'utf-8')) as DeploymentExamples;

    for (const [key, example] of Object.entries(content.examples)) {
      expect(example.architecture).toBeDefined();
      expect(example.architecture.length).toBeGreaterThan(0);
      expect(example.architecture).toMatch(/graph|diagram|flow|component/i);
    }
  });

  it('should have integration code snippets for each example', () => {
    const content = JSON.parse(fs.readFileSync(examplesPath, 'utf-8')) as DeploymentExamples;

    for (const [key, example] of Object.entries(content.examples)) {
      expect(example.integrationCode).toBeDefined();
      expect(example.integrationCode.length).toBeGreaterThan(0);
      expect(example.integrationCode).toMatch(/const|function|class|contract/i);
    }
  });

  it('should have performance data comparing before/after restoration', () => {
    const content = JSON.parse(fs.readFileSync(examplesPath, 'utf-8')) as DeploymentExamples;

    for (const [key, example] of Object.entries(content.examples)) {
      expect(example.performanceData).toBeDefined();
      expect(example.performanceData.before).toBeGreaterThan(0);
      expect(example.performanceData.after).toBeGreaterThan(0);
      expect(example.performanceData.after).toBeLessThan(example.performanceData.before);
      expect(example.performanceData.improvement).toMatch(/faster|%|improvement/i);
    }
  });

  it('should include lessons learned for each example', () => {
    const content = JSON.parse(fs.readFileSync(examplesPath, 'utf-8')) as DeploymentExamples;

    for (const [key, example] of Object.entries(content.examples)) {
      expect(Array.isArray(example.lessonsLearned)).toBe(true);
      expect(example.lessonsLearned.length).toBeGreaterThan(0);

      for (const lesson of example.lessonsLearned) {
        expect(typeof lesson).toBe('string');
        expect(lesson.length).toBeGreaterThan(0);
      }
    }
  });

  it('should have at least 5 deployment examples', () => {
    const content = JSON.parse(fs.readFileSync(examplesPath, 'utf-8')) as DeploymentExamples;

    const exampleCount = Object.keys(content.examples).length;
    expect(exampleCount).toBeGreaterThanOrEqual(5);
  });

  it('should have complete example structure', () => {
    const content = JSON.parse(fs.readFileSync(examplesPath, 'utf-8')) as DeploymentExamples;

    for (const example of Object.values(content.examples)) {
      expect(example).toHaveProperty('name');
      expect(example).toHaveProperty('description');
      expect(example).toHaveProperty('architecture');
      expect(example).toHaveProperty('integrationCode');
      expect(example).toHaveProperty('performanceData');
      expect(example).toHaveProperty('lessonsLearned');
    }
  });

  it('should have realistic performance improvements', () => {
    const content = JSON.parse(fs.readFileSync(examplesPath, 'utf-8')) as DeploymentExamples;

    for (const example of Object.values(content.examples)) {
      const { before, after } = example.performanceData;
      const improvement = (((before - after) / before) * 100).toFixed(1);

      // Restoration should improve performance by at least 30%
      expect(parseFloat(improvement)).toBeGreaterThanOrEqual(30);
    }
  });
});
