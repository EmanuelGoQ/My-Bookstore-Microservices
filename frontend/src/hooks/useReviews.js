import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { reviewKeys } from "../lib/queryKeys.js";
import { reviewService } from "../services/reviewService.js";

export const useBookReviews = (bookId) =>
  useQuery({
    queryKey: reviewKeys.byBook(bookId),
    queryFn: () => reviewService.listByBook(bookId),
    enabled: Boolean(bookId),
  });

export const useCreateReview = (bookId) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => reviewService.create({ bookId, ...payload }),
    onSuccess: () => {
      // Re-fetch so the reviewer name (resolved via gRPC) and ordering show.
      queryClient.invalidateQueries({ queryKey: reviewKeys.byBook(bookId) });
    },
  });
};
