export interface AttendanceWarningRecipient {
  name: string;
  email: string;
  relation: 'PARENT';
}

export interface LowAttendanceDispatchResult {
  success: boolean;
  total: number;
  sent: number;
  failed: number;
  recipients: string[];
  errors: string[];
}