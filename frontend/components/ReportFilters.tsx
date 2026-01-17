"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Filter, RefreshCw } from 'lucide-react';

interface DateRange {
  startDate: string;
  endDate: string;
}

interface ReportFiltersProps {
  title?: string;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
  period?: string;
  onPeriodChange?: (period: string) => void;
  additionalFilters?: React.ReactNode;
  onRefresh?: () => void;
  loading?: boolean;
}

const ReportFilters: React.FC<ReportFiltersProps> = ({
  title = "Report Filters",
  dateRange,
  onDateRangeChange,
  period,
  onPeriodChange,
  additionalFilters,
  onRefresh,
  loading = false
}) => {
  const handleStartDateChange = (value: string) => {
    onDateRangeChange({
      ...dateRange,
      startDate: value
    });
  };

  const handleEndDateChange = (value: string) => {
    onDateRangeChange({
      ...dateRange,
      endDate: value
    });
  };

  const setQuickRange = (days: number) => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    onDateRangeChange({
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Filter className="h-5 w-5 mr-2" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Date Ranges */}
        <div>
          <Label className="text-sm font-medium">Quick Ranges</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuickRange(7)}
            >
              Last 7 days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuickRange(30)}
            >
              Last 30 days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuickRange(90)}
            >
              Last 90 days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const now = new Date();
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                onDateRangeChange({
                  startDate: startOfMonth.toISOString().split('T')[0],
                  endDate: endOfMonth.toISOString().split('T')[0]
                });
              }}
            >
              This Month
            </Button>
          </div>
        </div>

        {/* Custom Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="start-date">Start Date</Label>
            <Input
              id="start-date"
              type="date"
              value={dateRange.startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="end-date">End Date</Label>
            <Input
              id="end-date"
              type="date"
              value={dateRange.endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        {/* Period Selection */}
        {period && onPeriodChange && (
          <div>
            <Label htmlFor="period">Period Grouping</Label>
            <Select value={period} onValueChange={onPeriodChange}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Additional Filters */}
        {additionalFilters && (
          <div>
            {additionalFilters}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-2 pt-4 border-t">
          {onRefresh && (
            <Button
              variant="outline"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ReportFilters;