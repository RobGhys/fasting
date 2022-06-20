const { ApolloServer, UserInputError , gql, AuthenticationError } = require('apollo-server')
const {v1: uuid}  = require('uuid')
const mongoose = require('mongoose')

const Person = require('./models/person')
const User = require('./models/user')

const jwt = require('jsonwebtoken')

const JWT_SECRET = 'coucou'

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
    type User {
        username: String!
        friends: [Person!]!
        id: ID!
    }

    type Token {
        value: String!
    }

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
        
        createUser(
            username: String!
        ): User

        login(
            username: String!
            password: String!
        ): Token

        addAsFriend(
            name: String!
        ): User
    }

    enum YesNo {
        YES
        NO
    }
    
    type Query {
        personCount: Int!
        allPersons(phone: YesNo): [Person!]!
        findPerson(name: String!): Person
        me: User
        allUsers: [User!]!
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
        findPerson: async (root, args) => Person.findOne( { name: args.name } ),

        allUsers: async () => User.find({}),

        me: (root, args, context) => { return context.currentUser }
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
        addPerson: async (root, args, context) => {
            const person = new Person({ ...args })
            const currentUser = context.currentUser

            if (! currentUser) throw new AuthenticationError('Not authenticated.')

            try {
                await person.save()

                // Add the new person to currentUser.friends
                currentUser.friends = currentUser.friends.concat(person)
                await currentUser.save()
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
        },
        createUser: async (root, args) => {
            const user = new User({ username: args.username })

            return user.save().catch(error => {
                throw new UserInputError(error.message, {
                    invalidArgs: args,
                })
            })
        },
        login: async (root, args) => {
            const user = await User.findOne({ username: args.username })

            if (!user || args.password !== 'coucou') {
                throw new UserInputError('wrong credentials!')
            }

            const userForToken = {
                username: user.username,
                id: user._id,
            }

            return { value: jwt.sign(userForToken, JWT_SECRET) }
        },
        // Destructures logged-in user from context to get Arg: { currentUser }
        addAsFriend: async (root, args, { currentUser }) => {

            if (! currentUser) throw new AuthenticationError('Not authenticated')

            // Function that verifies if a person is already in currentUser.friends
            const nonFriendAlready = (person) =>
                ! currentUser.friends.map(f => f._id.toString()).includes(person._id.toString())

            // Add person to currentUser.friends
            const person = await Person.findOne({ name: args.name })
            if (nonFriendAlready(person)) currentUser.friends = currentUser.friends.concat(person)

            await currentUser.save()

            return currentUser
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
    // Context is used by shared resolvers
    context: async ({ req }) => {
        const auth = req ? req.headers.authorization : null

        if (auth && auth.toLowerCase().startsWith('bearer ')) {
            const decodedToken = jwt.verify(
                auth.substring(7), JWT_SECRET
            )

            // Get user who made the request
            const currentUser = await User.findById(decodedToken.id).populate('friends')

            return { currentUser }
        }
    }
})

server.listen().then(({ url }) => {
    console.log(`Server ready at ${url}`)
})