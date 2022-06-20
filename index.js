const { ApolloServer, UserInputError , gql } = require('apollo-server')
const {v1: uuid}  = require('uuid')
const mongoose = require('mongoose')
const Person = require('./models/person')

if (process.argv.length < 3) {
    console.log('Please provide your password as an argument: node mongo.js <password>')
    process.exit(1)
}

const password = process.argv[2]

const MONGODB_URI = `mongodb+srv://robghys:${password}@cluster0.3jic8.mongodb.net/?retryWrites=true&w=majority`

console.log('connecting to', MONGODB_URI)

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch((error) => {
    console.log('error connection to MongoDB:', error.message)
  })

let persons = []

const typeDefs = gql`
    type Address {
        street: String!
        city: String!
    }
  
    type Person {
        name: String!
        phone: String
        address: Address!
        id: ID!
    }

    type Mutation {
        addPerson(
            name: String!
            phone: String
            street: String!
            city: String!
        ): Person
        editNumber(
            name: String!
            phone: String!
        ): Person
    }

    enum YesNo {
        YES
        NO
    }
    
    type Query {
        personCount: Int!
        allPersons(phone: YesNo): [Person!]!
        findPerson(name: String!): Person
    }
`

/**
 *  Defines how GraphQL queries are responded to
 *  If a type has no explicit resolver, GraphQL uses default resolvers for it
 */
const resolvers = {
    Query: {
        personCount: async () => Person.collection.countDocuments(),

        allPersons: async (root, args) => {
            // Return all persons
            if (!args.phone) return Person.find({})
            

            return Person.find({ phone: { $exists: args.phone === 'YES' } })
        },

        // args contains the query parameters
        findPerson: async (root, args) => Person.findOne({name: args.name})
    },
    Person: {
      address: (root) => {
          return {
              street: root.street,
              city: root.city
          }
      }
    },
    Mutation: {
        addPerson: async (root, args) => {
            const person = new Person({ ...args })

            try {
                await person.save()
            } catch (error) {
                throw new UserInputError(error.message, {
                    invalidArgs: args,
                })
            }
            
            return person;
        },
        editNumber: async (root, args) => {
            const person = await Person.findOne({ name: args.name })
            person.phone = args.phone

            try {
                await person.save();    
            } catch (error) {
                throw new UserInputError(error.message, {
                    invalidArgs: args,
                })
            }
            
            return person;
        }
    }
}

/**
  * typeDefs: the GraphQL schema
  * resolvers: contains the resolvers of the server
 */
const server = new ApolloServer({
    typeDefs,
    resolvers,
})

server.listen().then(({ url }) => {
    console.log(`Server ready at ${url}`)
})