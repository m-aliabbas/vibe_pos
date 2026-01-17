import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, TrendingUp, PieChart } from 'lucide-react';

interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string;
    borderColor?: string;
  }[];
}

interface ChartContainerProps {
  title: string;
  type: 'bar' | 'line' | 'pie' | 'doughnut';
  data: ChartData;
  height?: number;
  loading?: boolean;
  emptyMessage?: string;
}

const ChartContainer: React.FC<ChartContainerProps> = ({
  title,
  type,
  data,
  height = 300,
  loading = false,
  emptyMessage = "No data available for chart"
}) => {
  const getChartIcon = () => {
    switch (type) {
      case 'bar':
        return BarChart3;
      case 'line':
        return TrendingUp;
      case 'pie':
      case 'doughnut':
        return PieChart;
      default:
        return BarChart3;
    }
  };

  const Icon = getChartIcon();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Icon className="h-5 w-5 mr-2" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center" style={{ height: `${height}px` }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading chart...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Placeholder for chart - will be replaced with actual chart library
  const hasData = data.datasets.some(dataset => dataset.data.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Icon className="h-5 w-5 mr-2" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex flex-col items-center justify-center text-gray-500" style={{ height: `${height}px` }}>
            <Icon className="h-12 w-12 mb-4 text-gray-300" />
            <p>{emptyMessage}</p>
            <p className="text-sm mt-2">Chart library not yet installed</p>
          </div>
        ) : (
          <div
            className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center"
            style={{ height: `${height}px` }}
          >
            <div className="text-center">
              <Icon className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {type.charAt(0).toUpperCase() + type.slice(1)} Chart
              </h3>
              <p className="text-gray-500 mb-4">
                Chart visualization will be displayed here
              </p>
              <div className="text-sm text-gray-400">
                <p>Labels: {data.labels.length}</p>
                <p>Datasets: {data.datasets.length}</p>
                {data.datasets.map((dataset, index) => (
                  <p key={index}>• {dataset.label}: {dataset.data.length} points</p>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ChartContainer;