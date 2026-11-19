import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { wishlistKeys } from "../lib/queryKeys.js";
import { wishlistService } from "../services/wishlistService.js";
import { useAuth } from "./useAuth.js";

export const useWishlist = () => {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: wishlistKeys.list(),
    queryFn: wishlistService.list,
    // Only fetch when logged in; the wishlist is per-customer.
    enabled: isAuthenticated,
  });
};

export const useAddToWishlist = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookId) => wishlistService.add(bookId),
    onSuccess: (items) => {
      queryClient.setQueryData(wishlistKeys.list(), items);
    },
  });
};

export const useRemoveFromWishlist = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookId) => wishlistService.remove(bookId),
    onSuccess: (items) => {
      queryClient.setQueryData(wishlistKeys.list(), items);
    },
  });
};
