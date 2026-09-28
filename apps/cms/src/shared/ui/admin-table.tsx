'use client';

import { Table, type TableProps } from 'antd';

export type AdminTableProps<RecordType extends object> = Omit<
  TableProps<RecordType>,
  'pagination'
>;

export function AdminTable<RecordType extends object>(
  props: AdminTableProps<RecordType>,
) {
  return <Table<RecordType> {...props} pagination={false} />;
}
