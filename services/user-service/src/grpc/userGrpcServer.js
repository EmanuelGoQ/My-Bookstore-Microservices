import { loadProto, grpc } from "@bookstore/shared";

// Implements the UserService gRPC contract (proto/user.proto). Consumed by
// order-service (customer validation) and review-service (reviewer name).
export const createUserGrpcService = (customerRepository, logger) => {
  const proto = loadProto("user.proto");
  const serviceDefinition = proto.bookstore.user.v1.UserService.service;

  const toGrpcCustomer = (customer) => ({
    customer_id: customer.customer_id,
    first_name: customer.first_name,
    last_name: customer.last_name,
    email: customer.email,
    city: customer.city ?? "",
    country: customer.country ?? "",
  });

  const implementation = {
    GetCustomer: async (call, callback) => {
      try {
        const customer = await customerRepository.findCustomerById(call.request.customer_id);
        if (!customer) {
          callback(null, { found: false, customer: null });
          return;
        }
        callback(null, { found: true, customer: toGrpcCustomer(customer) });
      } catch (error) {
        logger.error("gRPC GetCustomer failed", { error: error.message });
        callback({ code: grpc.status.INTERNAL, message: "GetCustomer failed" });
      }
    },
  };

  return { service: serviceDefinition, implementation };
};
