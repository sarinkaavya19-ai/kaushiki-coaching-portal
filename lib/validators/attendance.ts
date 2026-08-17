import { z } from 'zod';

export const bulkAttendanceSchema = z.object({
  batchId: z.string(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  records: z.array(z.object({
    studentId: z.string(),
    present: z.boolean(),
  }))
    .min(1, 'At least one attendance record required')
    .max(1000, 'At most 1000 records per request')
    .refine((records) => new Set(records.map((r) => r.studentId)).size === records.length, {
      message: 'Duplicate studentId entries are not allowed',
    }),
});

export const listAttendanceSchema = z.object({
  batchId: z.string().optional(),
  studentId: z.string().optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const lowAttendanceQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM')
    .refine((month) => {
      const monthIndex = Number(month.split('-')[1]);
      return monthIndex >= 1 && monthIndex <= 12;
    }, 'Month must be a valid YYYY-MM value')
    .optional(),
  threshold: z.coerce.number().int().min(1).max(100).optional(),
});
