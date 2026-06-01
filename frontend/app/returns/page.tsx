"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import {ProtectedRoute} from "@/components/ProtectedRoute";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RotateCcw, Package } from "lucide-react";
import api from "@/lib/api";

interface ReturnItem {
  product_name: string;
  quantity: number;
  unit: string;
}

interface Return {
  id: number;
  customer_name?: string;
  customer_phone?: string;
  processed_by_username?: string;
  reason: string;
  notes?: string;
  created_at: string;
  items: ReturnItem[];
}

export default function ReturnsPage() {
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(false);

  // View return dialog
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null);

  useEffect(() => {
    if (token) {
      fetchReturns();
    }
  }, [token]);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const response = await api.get("/returns/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReturns(response.data);
    } catch (error) {
      console.error("Failed to fetch returns:", error);
    } finally {
      setLoading(false);
    }
  };

  const viewReturn = async (returnId: number) => {
    try {
      const response = await api.get(`/returns/${returnId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSelectedReturn(response.data);
      setViewDialogOpen(true);
    } catch (error) {
      console.error("Failed to fetch return:", error);
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <ProtectedRoute>
      <div className="p-6 h-full flex flex-col gap-6">
        {/* Header */}
        <div className="shrink-0 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <RotateCcw className="h-8 w-8" />
              Returns & Refunds
            </h1>
            <p className="text-muted-foreground">Process product returns and refunds</p>
          </div>
          <Button onClick={() => router.push("/returns/create")}>
            <Package className="mr-2 h-4 w-4" />
            Process Return
          </Button>
        </div>

        {/* Returns List */}
        <div className="flex-1 min-h-0 overflow-y-auto">
        <Card>
          <CardHeader>
            <CardTitle>Return History</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-4">Loading returns...</p>
            ) : returns.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                No returns found
              </p>
            ) : (
              <div className="space-y-4">
                {returns.map((ret) => (
                  <div
                    key={ret.id}
                    className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => viewReturn(ret.id)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold">Return #{ret.id}</span>
                          <Badge variant="outline">{ret.reason}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {ret.customer_name || "No customer"} 
                          {ret.customer_phone && ` • ${ret.customer_phone}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {ret.items.length} item(s) • Processed by {ret.processed_by_username || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(ret.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </div>

        {/* View Return Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Return Details</DialogTitle>
            </DialogHeader>

            {selectedReturn && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Return ID</p>
                    <p className="font-semibold">#{selectedReturn.id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Reason</p>
                    <p className="font-semibold capitalize">
                      {selectedReturn.reason.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Customer</p>
                    <p className="font-semibold">
                      {selectedReturn.customer_name || "No customer"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Phone</p>
                    <p className="font-semibold">
                      {selectedReturn.customer_phone || "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Processed By</p>
                    <p className="font-semibold">
                      {selectedReturn.processed_by_username || "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Date</p>
                    <p className="font-semibold">
                      {new Date(selectedReturn.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {selectedReturn.notes && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm bg-muted p-2 rounded">{selectedReturn.notes}</p>
                  </div>
                )}

                <div>
                  <p className="text-sm font-medium mb-2">Returned Items</p>
                  <div className="border rounded divide-y">
                    {selectedReturn.items.map((item, idx) => (
                      <div key={idx} className="p-3 text-sm">
                        <div className="flex justify-between">
                          <div>
                            <p className="font-medium">{item.product_name}</p>
                            <p className="text-xs text-muted-foreground">
                              Quantity: {item.quantity} {item.unit}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}
