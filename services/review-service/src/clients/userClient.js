import { loadProto, createGrpcClient, callUnary } from "@bookstore/shared";

// gRPC client to user-service. review-service uses it to resolve the reviewer's
// display name for a batch of customer ids.
export const createUserClient = (target) => {
  const proto = loadProto("user.proto");
  const ServiceClient = proto.bookstore.user.v1.UserService;
  const client = createGrpcClient(ServiceClient, target);

  const getCustomer = async (customerId) => {
    const response = await callUnary(client, "GetCustomer", { customer_id: customerId });
    if (!response.found) {
      return null;
    }
    return {
      customerId: response.customer.customer_id,
      firstName: response.customer.first_name,
      lastName: response.customer.last_name,
    };
  };

  return { getCustomer };
};
