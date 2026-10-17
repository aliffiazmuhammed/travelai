import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues ?? (error as any).errors ?? [];
        const errorMessages = issues.map((e: any) => e.message);
        const friendlyMessage = errorMessages[0] || 'Please check the information you entered and try again.';
        return res.status(400).json({
          success: false,
          error: friendlyMessage,
          message: friendlyMessage,
          details: errorMessages,
        });
      }
      next(error);
    }
  };
};
