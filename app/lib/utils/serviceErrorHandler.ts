// Cude.new - serviceErrorHandler.ts (Cude product surface, 2026)
export interface ServiceError {
  code?: string;
  message: string;
  details?: any;
  service: string;
  operation: string;
}
