// Polyfill TextEncoder/TextDecoder for JSDOM (required by react-router v7)
import { TextEncoder, TextDecoder } from 'util';
Object.assign(global, { TextEncoder, TextDecoder });

// jest-dom adds custom jest matchers for asserting on DOM nodes.
import '@testing-library/jest-dom';
