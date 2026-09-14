import { deriveFeatureCapabilities, type FeatureCode } from '../lib/feature-permissions.js';

const configuredFeatures: readonly string[] = ['rate_recipes', 'future_feature'];
deriveFeatureCapabilities(configuredFeatures);

const editableFeature: FeatureCode = 'send_report';
deriveFeatureCapabilities([editableFeature]);
